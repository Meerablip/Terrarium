# Third-party notices

## kuku (voxel world renderer)

Several files under [`src/render3d/`](src/render3d/) are ported or adapted
from [kuku](https://github.com/kuku-mom/kuku)'s `voxel_graph` plugin
(`apps/desktop/src/plugins/builtin/voxel_graph/`), used under the MIT
License. Each ported/adapted file carries a header comment noting its kuku
origin and whether it's a near-verbatim port or a rework.

```
MIT License

Copyright (c) 2026 kuku-mom

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Note: kuku's bundled `.glb` 3D art assets (house and character models) are
**not** used here — see the render3d implementation plan for why (kuku-branded
art is a separate, more questionable thing to redistribute than MIT-licensed
code). All geometry in `src/render3d/` is procedural/primitive.
