# Changelog

## [1.2.1](https://github.com/jurislm/hetzner-mcp/compare/v1.2.0...v1.2.1) (2026-05-08)


### Bug Fixes

* add percentage usage to storage box markdown output ([55135ad](https://github.com/jurislm/hetzner-mcp/commit/55135adc55b34c6bbd8fb9854ce612361aa271d1))
* add percentage usage to storage box markdown output ([#22](https://github.com/jurislm/hetzner-mcp/issues/22)) ([2935774](https://github.com/jurislm/hetzner-mcp/commit/2935774ec63147a0096bce8d63bb13b09af05174))
* guard usagePercent against division by zero ([c5bcff3](https://github.com/jurislm/hetzner-mcp/commit/c5bcff36cdfff40542a603828acc68d6b38c3042))

## [1.2.0](https://github.com/jurislm/hetzner-mcp/compare/v1.1.1...v1.2.0) (2026-05-05)


### Features

* add pagination for servers/ssh-keys and filters for storage boxes ([b6854d8](https://github.com/jurislm/hetzner-mcp/commit/b6854d8e7a95df3a4c72c3a64316e0961e0a784b))
* add pagination for servers/ssh-keys and filters for storage boxes ([31bc9de](https://github.com/jurislm/hetzner-mcp/commit/31bc9de650468a37d7223e73629cfb29dbfa4588))
* implement 14 missing Storage Box API endpoints ([76eee1b](https://github.com/jurislm/hetzner-mcp/commit/76eee1b12d4b39813b26e80a565b66086c57ca8e))
* implement 14 missing Storage Box API endpoints ([#12](https://github.com/jurislm/hetzner-mcp/issues/12)) ([6a56f9a](https://github.com/jurislm/hetzner-mcp/commit/6a56f9a0504ce8d60edf77d52d001af73af4761e))


### Bug Fixes

* make storage_box_type.size required per official API spec ([3dd51e4](https://github.com/jurislm/hetzner-mcp/commit/3dd51e48dcf99851fdfccab7b729bb82a0c3e3a6))
* use storage_box_type.size for total capacity in formatStorageBox (closes [#16](https://github.com/jurislm/hetzner-mcp/issues/16)) ([7568cac](https://github.com/jurislm/hetzner-mcp/commit/7568cac9b5bccf38e374a0670de3d671dc8e3a1c))


### Documentation

* add Hetzner unified API reference with implementation coverage ([081224c](https://github.com/jurislm/hetzner-mcp/commit/081224c6b88edfe23363f0bbaa6df0b9930a49cf))

## [1.1.1](https://github.com/jurislm/hetzner-mcp/compare/v1.1.0...v1.1.1) (2026-05-05)


### Bug Fixes

* restore [@jurislm](https://github.com/jurislm) scope in package.json name ([#11](https://github.com/jurislm/hetzner-mcp/issues/11)) ([24a1516](https://github.com/jurislm/hetzner-mcp/commit/24a1516b533717f1269ff76942f25923d4ed242f))
* update HetznerStorageBoxSchema to match unified API structure (closes [#13](https://github.com/jurislm/hetzner-mcp/issues/13)) ([#14](https://github.com/jurislm/hetzner-mcp/issues/14)) ([0e91466](https://github.com/jurislm/hetzner-mcp/commit/0e91466241d951864b3a3b77f31125dc972352ed))

## [1.1.0](https://github.com/jurislm/hetzner-mcp/compare/v1.0.0...v1.1.0) (2026-05-04)


### Features

* add Storage Box snapshot management tools (closes [#8](https://github.com/jurislm/hetzner-mcp/issues/8)) ([#9](https://github.com/jurislm/hetzner-mcp/issues/9)) ([3a28085](https://github.com/jurislm/hetzner-mcp/commit/3a28085179b97b79c3b565e12a1f13aced6a698e))


### Bug Fixes

* address /review-pr round 3 — Critical + Important findings ([e1520d2](https://github.com/jurislm/hetzner-mcp/commit/e1520d2c9923d362db1b9af39a32f68e612befd6))
* restore storage-boxes in docs and add storage-boxes spec ([824ba2a](https://github.com/jurislm/hetzner-mcp/commit/824ba2a2e0876c2d9bd5a433d4f62d3d402c336d))
* restore storage-boxes in docs and add storage-boxes spec ([4484d86](https://github.com/jurislm/hetzner-mcp/commit/4484d86a3282460ce85df9e6018f57b8952a3ed2))
* **storage-boxes:** address /review-pr round 2 findings ([3c360af](https://github.com/jurislm/hetzner-mcp/commit/3c360af75a9f49224cbbab5dae237c9865dabec1))
* **storage-boxes:** address PR [#2](https://github.com/jurislm/hetzner-mcp/issues/2) review findings + add vitest baseline ([6a6daae](https://github.com/jurislm/hetzner-mcp/commit/6a6daae261ad8b44ac23b34d82f3cc1a840bdd45))
* **storage-boxes:** C-1 Zod runtime validation at API boundary ([38dec82](https://github.com/jurislm/hetzner-mcp/commit/38dec82c0091f008d7b7e8e3215f568c174aaa85))


### Documentation

* add CLAUDE.md reflecting 17 tools, vitest, GitHub Actions ([f9ba129](https://github.com/jurislm/hetzner-mcp/commit/f9ba1292987dea35e4c24f137ad181cc1a980b83))
* add openspec specs and fix CLAUDE.md ghost entities ([a9f75d0](https://github.com/jurislm/hetzner-mcp/commit/a9f75d05dd045e4d9ddd2548b066e1a10924ed25))
* add openspec specs and fix CLAUDE.md ghost entities ([3fc00de](https://github.com/jurislm/hetzner-mcp/commit/3fc00de8a6c2d51121de8efbe6af93306f804322))
* rewrite README to match jurislm MCP standard format ([9a70686](https://github.com/jurislm/hetzner-mcp/commit/9a70686392cc8cd96585ad0b354c0d179a4b7861))
* update copilot-instructions with hetzner-mcp specific context ([630fdf3](https://github.com/jurislm/hetzner-mcp/commit/630fdf3428f62f971cb5e3aa17719d04ab682bc9))
* use bunx instead of npx in MCP configuration example ([3b7f457](https://github.com/jurislm/hetzner-mcp/commit/3b7f457fe46b84fcaa87f9797b418de5bd4893e5))
