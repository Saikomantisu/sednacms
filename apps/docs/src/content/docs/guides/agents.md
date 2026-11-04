---

title: Add Sedna with an agent
description: Install the add-sednacms skill to make existing Astro content editable.
---

Use the [add-sednacms skill](https://github.com/Saikomantisu/sednacms/blob/main/skills/add-sednacms/SKILL.md) to have a coding agent
add Sedna to your Astro site while keeping its design and URLs. The agent configures
live collections, the server, and admin setup. It can also configure uploads and
check that published edits appear without a rebuild.

Copy `skills/add-sednacms/` from this repository into your agent's skills directory.
For Codex, install it from a local Sedna checkout:

```sh
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/add-sednacms "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Then open the target Astro project and ask:

```text
Use $add-sednacms to make this site's blog posts editable in SednaCMS.
Keep the existing design and post URLs.
```

You can also install the skill in other agents that support the `SKILL.md` format.
You still need to provision a database and deploy the site.
