// Ambient module declaration for sprite/tile PNG imports (src/assets/**).
// Vite resolves these to a URL string at build time; TypeScript needs this
// declaration to know that shape, since it has no built-in knowledge of
// .png as an importable asset type the way it does for .json. Needs no
// accompanying vite.config.ts change — PNG is already in Vite's default
// handled-asset-type list (unlike the old renderer's .glb, which needed an
// explicit assetsInclude entry).

declare module "*.png" {
  const url: string;
  export default url;
}
