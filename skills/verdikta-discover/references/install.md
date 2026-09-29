# Install and deploy the preview

Obtain the complete [skill directory](https://github.com/verdikta/verdikta-applications/tree/feat/buyer-discovery-preview/skills/verdikta-discover) and [entrypoint](https://raw.githubusercontent.com/verdikta/verdikta-applications/refs/heads/feat/buyer-discovery-preview/skills/verdikta-discover/SKILL.md) from the review branch. Pin the commit you reviewed; branch URLs are mutable. No registry release is published. Copy the complete directory to the host runtime’s skill location and follow that runtime’s loader instructions; native OpenClaw/Hermes loading remains unverified.

The instructions work without Node. For the optional CLI, use Node 20.18+ and run `npm ci --ignore-scripts` inside the skill directory. For permission-isolated tests, use Node 22.13+ (or the experimental permission flag on older supported Node).

Before building the website, run `npm ci --ignore-scripts` inside `example-bounty-program/client`. The client directly pins AJV 8, formats and checksum dependencies; a stale install may resolve AJV 6 and fail. BuyerPreview is loaded only on the Agents page; AJV runtime compilation still requires a CSP allowing evaluation on that page. A strict-CSP deployment should precompile the validators before enabling the preview.
