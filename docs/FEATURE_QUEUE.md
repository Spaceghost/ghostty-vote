# Voted feature queue

The public [implementation queue](https://spacegho.st/mods/ffxiv/roadmap/) contains
235 accepted ideas across eleven voting projects. It combines the original
201-feature commitment with 34 newer ideas supported by a live Want majority.

The original Maybe and Skip choices remain exclusions. A later public Want vote
does not silently overwrite that confirmed ballot. The Wayfinder FATE idea has
one Want and one Maybe and appears under review, outside the accepted queue.
Ideas without a Want majority in new projects remain on their voting pages.

`data/feature-queue.json` records public counts, capture time, GitHub tracking
issues and available implementation evidence. It includes no voter identities,
notes or account data. The snapshot is dated; new votes require a new review and
snapshot. `data/accepted-votes.json` remains the original commitment.

`imba/scripts/feature-queue.imba` resolves and orders the queue. Feasibility comes
first, followed by estimated effort, Want count and the catalogue's top-pick and
value signals. Shared dependencies and release checks can change which item
starts next. The estimates are not delivery dates. Each project's tracking issue
keeps an ordered checklist and records implementation/release acceptance.

Seven Piano ideas have source/build evidence. They await applicable live
acceptance and are not marked delivered. Check existing implementation before
building any queued idea; several current branches already contain work.

Run `npm run build` to precompile the native Imba generator and publish the HTML
and `roadmap/queue.json`. `npm run check` detects generated drift. Queue tests
reject incomplete or invalid tallies and protect the accepted/excluded scope.
Refresh public tallies for all eleven catalogues before changing the snapshot;
update the relevant GitHub checklist and evidence when delivery status changes.

# Progressive Imba components

`imba/public/mods/ffxiv/site/enhancements.imba` defines small components on complete
HTML pages. Native tags, bound inputs, keyed results, events and lifecycle hooks
provide project search and queue filtering. A native dialog handles focus and
Escape. Links retain normal document navigation; there is no client router.
Search and filters enhance the existing HTML, rather than replacing it.

Queue filters have shareable query parameters and a live result count. The table
and ordinary links remain complete when JavaScript or a static data request is
unavailable. Motion respects the receiving device's reduced-motion preference.
Supported browsers can use CSS transitions between separate documents.

The compiler writes generated tag styles into `enhancements.imba.css`, removing
only the corresponding compiler-generated CSS registration from the bundle.
This avoids injecting inline styles under the site's existing content policy.
Third-party Imba code remains unchanged. Both JavaScript and generated CSS are
checked for drift; authored JavaScript has no separate manual source.

Real Chromium checks cover search, full-document navigation, native dialog and
Escape, filters and deep links, mobile overflow, reduced motion, JavaScript
disabled and strict CSP. Account/admin utility pages keep their existing scripts.
