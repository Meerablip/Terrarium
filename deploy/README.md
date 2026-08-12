# Deploying the Terrarium world server

This covers taking the world server from "runs locally" to "runs on a VM."
**Verify everything locally first** (steps 1–2 below) before touching the
real machine — deploying to a live box you can't directly inspect from here
is a manual step, done once this is proven.

## 1. Local verification

In one terminal, start the world server:

```
npm run server
```

This opens (or creates) `data/terrarium.db`, starts ticking the simulation,
and listens for WebSocket connections on port 8080 (override with the
`PORT` env var; override the DB path with `DB_PATH`).

In a second terminal, start the browser client:

```
npm run dev
```

Open the printed URL — it connects to `ws://localhost:8080` and renders
whatever the server broadcasts. Confirm citizens/materials/homes render and
move, that clicking a citizen opens the stat panel and follows it, and that
zooming out switches to the labeled map view.

Kill the server (`Ctrl-C`, or `kill <pid>` — not `-9`) and restart it
(`npm run server` again); confirm the startup log says `Loaded snapshot at
tick N` (not "creating a fresh world") and that the client, left open,
reconnects on its own within a couple of seconds.

## 2. The OCI iptables gotcha

**Read this before opening a port in the OCI Console and wondering why
nothing connects.** Ubuntu cloud images published for Oracle Cloud
Infrastructure ship with `iptables`/`netfilter-persistent` rules,
pre-populated by cloud-init at first boot, that **drop inbound traffic on
any port not already explicitly permitted** — typically only SSH (22) is
allowed out of the box.

This is a **host-OS-level firewall**, entirely separate from — and in
addition to — OCI's **Console-level Security Lists / Network Security
Groups (NSGs)**, which are a different, cloud-infrastructure-level firewall
enforced upstream of the VM's own network stack. **Both layers filter
independently.** Opening a port in the Console's Security List/NSG is
necessary but **not sufficient**: traffic that clears that check still hits
the VM's own `iptables` rules and gets silently dropped there. The symptom
is a connection that just hangs or times out with no error on either
side — indistinguishable from an application bug unless you know to check
both layers.

**Fix, on the VM itself:**

```
sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save   # persists the rule across reboots
```

...**in addition to** adding an ingress rule for TCP/8080 (from your
intended source CIDR) in the OCI Console's Security List or NSG attached to
the VM's subnet/VNIC.

## 3. Which port(s) to open

**Only TCP 8080** — the WebSocket port the world server listens on
(`DEFAULT_PORT` in `src/server/constants.ts`, overridable via the `PORT`
env var / the systemd unit's `Environment=PORT=...` line). Nothing else
needs to be exposed:

- The SQLite file is local-disk-only, never network-accessible.
- Serving the browser client bundle itself (the Vite build output) is out
  of scope for this server — this pass is specifically about the
  WebSocket-serving simulation process, not a static-file host.

## 4. Where the database lives

`/opt/terrarium/data/terrarium.db`, matching the systemd unit's
`WorkingDirectory` and `DB_PATH`. The server runs SQLite in **WAL mode**,
which means two sidecar files also exist alongside it at runtime:

```
/opt/terrarium/data/terrarium.db
/opt/terrarium/data/terrarium.db-wal
/opt/terrarium/data/terrarium.db-shm
```

A backup that only copies `terrarium.db` and misses the `-wal`/`-shm` files
is incomplete — see the backup command below, which handles this correctly
by construction rather than requiring you to remember all three files.

## 5. Backing up the database — the one correct way

**Do not `cp` the `.db` file while the server is running.** Under WAL mode,
committed-but-not-yet-checkpointed data lives in the `-wal` sidecar file; a
raw `cp` of `.db` alone (or a non-atomic copy of all three files) can
produce an inconsistent, corrupt backup. The only supported method is
SQLite's own WAL-aware online backup API, which is safe against a live,
concurrently-writing connection:

```
mkdir -p /opt/terrarium/data/backups
sqlite3 /opt/terrarium/data/terrarium.db ".backup /opt/terrarium/data/backups/terrarium-$(date +%Y%m%d-%H%M%S).db"
```

This is the one-liner to run manually, or to wrap in a cron job later — not
`cp`, not `rsync` of the raw `.db`/`-wal`/`-shm` files.

## 6. Installing the systemd unit (once local verification has passed)

```
sudo useradd --system --home /opt/terrarium --shell /usr/sbin/nologin terrarium
sudo mkdir -p /opt/terrarium
sudo cp -r <this repo> /opt/terrarium
sudo chown -R terrarium:terrarium /opt/terrarium

sudo cp deploy/terrarium.service /etc/systemd/system/terrarium.service
sudo systemctl daemon-reload
sudo systemctl enable terrarium
sudo systemctl start terrarium

# Check it came up:
sudo systemctl status terrarium
sudo journalctl -u terrarium -f
```

`Restart=always` + `RestartSec=5` recovers from a crash; `systemctl enable`
+ `WantedBy=multi-user.target` starts it automatically on VM reboot. The
service runs as the dedicated non-root `terrarium` user created above, not
root.

`ExecStart` runs `npx tsx src/server/index.ts` directly rather than a
compiled build — this project has no working `tsc`-emission path today
(`vite build` produces a browser bundle, not a Node server build), and
`tsx` is the same tool the project already uses to run sim code standalone
(`npm run sim:headless`). Standing up a separate compiled-build pipeline
was judged out of scope for this pass.
