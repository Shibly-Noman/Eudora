# Eudora platform pivot — analysis and review plan

**Confirmed application name: Eudora Moon.** Use this full name in application branding and user-facing references. “Moon” below is shorthand for Eudora Moon.

**Confirmed artwork and publishing scope.** Each Eudora Moon story has a cover illustration used for its library/story-card preview. Each narration section owns its own ordered artwork assets, including illustrations and backgrounds, so visuals change with the active section. The cover is separate from section artwork and does not substitute for it. The authorized publishing workflow includes artwork upload/management, narrator selection, server-side readiness checks, and stable published releases while authors edit the next draft.

**Status: proceeding after the user's review and instruction to proceed. Date: 9 September 2026.** The authoring and publishing increment is implemented locally, including cover uploads, per-section artwork, narrator selection, saved-story preview, readiness checks, and versioned publication. Unresolved product choices below remain proposals, not confirmed requirements. The user's Pivot Directive remains the authority for direction.

**Confirmed audience: English first, ages 7–10, with more independent reading.** The working interaction assumption is illustrated, authored stories with reviewed narration and bounded spoken questions about the current story. This assumption follows the plan's recommended starting point; it is not a separately selected answer to the earlier either/or question. Execution evidence and remaining decisions are tracked in [Eudora Moon validation](C:/shibly/eudora_v2/EUDORA-MOON-VALIDATION.md).

**Recommendation.** Keep the current backend and develop Moon as a distinct product domain within it. Eudora Moon will be a separate mobile application codebase that consumes the shared backend; the existing Academic mobile project is paused reference material, not Moon's application foundation. Reuse backend platform services and the existing story domain where appropriate. The course/lesson model should remain Academic-owned. The code already supports stories outside courses and already integrates ElevenLabs; Moon needs a finished product around those capabilities, with clearer publishing, access, voice, and operational rules.

**Direction and evidence.** Eudora Moon is the priority; the reviewed direction has progressed into the authorized authoring and publishing increment. Academic is paused and unfinished. Maths, Arts of Language, Abacus, and subsequent apps remain planned, without implementation scope inferred here. Faster delivery should come from a focused product and selective reuse, while preserving the required standard of production-quality UX, error handling, and polish.

The initial assessment below used the working-tree source, schema, and build configuration, including existing uncommitted work as evidence of what was present, not proof of what had shipped. Prior `.claude` configuration, README descriptions, older scope documents, and aspirational source comments were not treated as requirements. That initial assessment changed only this document and ran no runtime tests. Subsequent validation and code changes are recorded separately in the linked validation report; initial gap descriptions below are historical where that report records a fix. Production configuration and device behavior remain unverified.

The three supplied images are visual references, not instructions or a screen specification. They suggest expressive, colorful illustration, friendly characters, and fantasy/discovery themes. They do not establish age range, personalization, character chat, generated artwork, animation, or a particular page layout. A future art brief should translate the references into original or licensed assets, consistent characters, readable text, and compositions suited to mobile screens.

**1. What is shared today, and what only looks shared**

The backend is one NestJS application with separate modules and a shared Prisma/PostgreSQL model. This is a useful starting point for multiple products; a platform rebuild or service split is not currently justified. See the [module composition](C:/shibly/eudora_v2/services/api-service/src/app.module.ts:47).

| Area | Existing implementation | Recommended boundary |
| --- | --- | --- |
| Identity and authentication | Password and federated identity support, cookie and native bearer entry points, rotating refresh sessions, roles and permissions. | Share account and authentication mechanics. Decide account sharing, allowed native OAuth clients, session attribution, and product staff permissions. Current sessions are not app-aware; native provider flows are not all equivalent. |
| Family and child access | Guardian-child relationships and verified acting-child resolution; child creation does not require enrollment. | Share relationship enforcement. Moon should request only necessary profile data and define guardian controls in product terms. The current `StudentProfile` requires a user record, full birth date, and gender; `hasAcademicAccess` is not yet a general Moon permission. |
| Storage and media delivery | Local/S3 providers, private upload operations, storage keys, authorized media routes, signed URLs. | Share transport and storage mechanics. Moon owns asset access, release lifetime, artwork variants, and any download policy. Verify the actual private bucket configuration. |
| Entitlements and billing | Grants to a child for a course or program; Stripe checkout, finite installments, webhook idempotency. | Preserve Academic behavior only. Moon purchases, paywalls, subscriptions, access grants and commerce are explicitly deferred and outside the current Moon scope. |
| Notifications | Notification records, email, Expo push, device registration. | Share delivery adapters. Add appropriate product routing before enabling shared-account notifications: current tokens are selected by user, so all that user's app devices can be targeted. |
| Audit and operations | Audit writer, validation, API error envelope, throttling, health endpoints, backend and web CI. | Share conventions. Product analytics, voice cost metering, operational dashboards, and incident diagnosis still need defined contracts and evidence. Audit logs and Academic progress are not a cross-app analytics platform. |
| Content, progress, rewards | Academic courses, concepts, modules, lessons, assessments, plus a separate story domain; student-wide streaks/XP. | Keep separate product semantics. Moon reading position and conversation state should not depend on class placement, grades, lesson completion, or a universal reward economy. |

Evidence: [native authentication](C:/shibly/eudora_v2/services/api-service/src/auth/auth-token.controller.ts:49), [session creation](C:/shibly/eudora_v2/services/api-service/src/auth/auth.service.ts:1090), [child profile](C:/shibly/eudora_v2/services/api-service/prisma/schema.prisma:631), [acting-child access](C:/shibly/eudora_v2/services/api-service/src/entitlements/acting-student.service.ts:30), [storage authorization contract](C:/shibly/eudora_v2/services/api-service/src/uploads/uploads.service.ts:138), [device selection](C:/shibly/eudora_v2/services/api-service/src/device-tokens/device-tokens.service.ts:34), and [audit writer](C:/shibly/eudora_v2/services/api-service/src/common/audit/audit.service.ts:23).

The proposed architecture is one backend with shared account/family, storage, and operational services, alongside Academic-owned and Moon-owned modules. Academic may reference a story through an adapter to its course structure. Moon should be able to onboard a family, browse, and read without creating a course, enrollment, classroom, purchase, or entitlement.

Application context belongs where it controls behavior: OAuth configuration, session/support attribution, editorial roles, notifications, analytics, quotas, and product access. It does not justify mechanically adding an application identifier to every table. A client-supplied product label must never grant access by itself. Reusable packages or separately deployed services should follow demonstrated reuse or operational need, not precede Moon.

**2. Does the academic content structure generalize to Moon?**

**Partially, and the repository already contains the useful separation.** The course hierarchy and lesson/card assessment engine do not naturally describe a picture book. The existing story models do: `Story → StoryChapter → StorySegment`, with artwork, narration, timing data, characters, and conversations. `Story.moduleItemId` is optional, so the same story can exist independently or occupy an Academic course slot. See the [story schema](C:/shibly/eudora_v2/services/api-service/prisma/schema.prisma:1298) and [standalone library routes](C:/shibly/eudora_v2/services/api-service/src/stories/stories.controller.ts:151). Moon's client will be a new standalone mobile codebase; the current Academic mobile project is not reused as its app shell.

| Approach | Assessment |
| --- | --- |
| Represent every Moon book as courses, lessons, and cards | Reject as the default. It imports curriculum, progress, and purchasing assumptions and makes authoring unnatural. |
| Evolve the existing story domain inside the current backend | Recommended. It preserves useful code and allows Moon-specific content and lifecycle rules. |
| Build an entirely separate Moon content backend/schema | Reserve for evidence that the existing story shape cannot express the chosen experience or support its operations. Current evidence does not require this. |

The existing mobile reader treats one segment as one page, while the authoring model treats a segment as a narration beat or paragraph. Those are not necessarily the same unit. Validate three representative books before deciding whether a segment can remain a page or whether Moon needs explicit pages/scenes containing multiple narration segments. If needed, that addition belongs in the story domain; it does not require an all-purpose content engine.

The proposed domain responsibilities are:

- A book's identity and editions: title, age/reading suitability, language, artwork and narration choices, and release availability. Exact fields depend on the launch decisions.
- Ordered pages/scenes and narration segments, with stable identities, asset references, and text/audio alignment where the chosen UX uses it.
- Discoverability independent of editorial status. The initial Moon library has no purchase or paywall behavior; a later commercial model must be designed separately.
- Reading state per child and book release: resume position, completion if useful, and consistency across devices if promised.
- Story interaction policy and conversations if conversational voice is selected. Academic's optional course link stays an integration point, not Moon's root identity.

Do not predesign branching graphs, personalized story generation, multiple character voices, or localization machinery beyond the selected experience. Record their implications as decisions. A small, coherent catalog can be a finished product; incomplete content and unreliable behavior cannot.

**3. Authoring: useful foundation, unfinished editorial product**

The existing editor supports standalone story creation/import, prose-to-draft assistance, chapter/segment editing, splitting/merging, performed narration text, audio generation, preview, and a publication status. Backend endpoints additionally support reordering, which is not wired into the inspected story editor/API client. AI-assisted drafting proposes structure for human review. These are valuable workflow pieces. See the [draft service](C:/shibly/eudora_v2/services/api-service/src/stories/story-draft.service.ts:56) and [story editor](C:/shibly/eudora_v2/client/src/app/(dashboard)/stories/[id]/page.tsx).

The academic authoring shell can host Moon's editorial tools, but its course forms are not the Moon workflow. The current story client does not expose the full artwork, cover, character, and narrator management experience supported or suggested by backend fields. Backend availability does not make those tasks usable by an editor. See the [authoring API client](C:/shibly/eudora_v2/client/src/features/stories/storiesApi.ts).

Important lifecycle gaps visible in source:

- Publication is an enum update. The library filters out stories with incomplete narration, but this is not a publish-time integrity check; direct reads follow a different access gate. See [status update](C:/shibly/eudora_v2/services/api-service/src/stories/stories.service.ts:173) and [read policy](C:/shibly/eudora_v2/services/api-service/src/stories/stories.controller.ts:74).
- Editing published content changes the live rows. Text changes invalidate audio, without a separate immutable release keeping the last complete book available to readers.
- Whole-story narration runs sequentially inside a request. Successful segments can be skipped on retry, but there is no persisted generation job or release/input identity ensuring a delayed result still matches the current draft. See [generation loop](C:/shibly/eudora_v2/services/api-service/src/stories/narration.service.ts:55) and [result write](C:/shibly/eudora_v2/services/api-service/src/stories/narration.service.ts:179).
- Standalone draft media preview needs validation: the media read policy can reject an unattached draft before granting staff access. This is a source-level concern, not a reproduced runtime result.
- An attached story still has a cascading relation to its Academic module item. Decide whether independently published stories must survive course/item deletion; the optional link alone does not establish lifecycle independence. See the [story relation](C:/shibly/eudora_v2/services/api-service/prisma/schema.prisma:1353).

Proposed finished workflow: **draft/import → edit text and illustrations → generate/review narration → preview on target devices → validate completeness and rights → publish a complete release → revise separately → replace or withdraw safely.**

A release should identify the exact text, assets, audio, voice/model settings, and reading structure that were approved. Narration work should be resumable, show per-segment failures, avoid duplicate paid work, and discard stale results. Published assets should remain available for active readers according to an explicit retention policy. Choose the smallest reliable mechanism after the workflow validation; a new queue technology or database design is not predetermined.

**4. Voice: clarify the experience before selecting the runtime**

ElevenLabs integration is already present. The backend calls TTS with timestamps, supports a story narrator voice, and selects different models for ordinary versus performed speech. Narration is stored for reuse. A separate script generates bundled Clio feedback clips. These are existing implementation choices, not approved Moon voice direction. See [ElevenLabs service](C:/shibly/eudora_v2/services/api-service/src/ai/elevenlabs.service.ts:107) and [voice generator](C:/shibly/eudora_v2/voice/generate-voice-lines.mjs).

The existing backend conversation path accepts text or recorded audio, uses Gemini for transcription and answers, then synthesizes a reply. It returns complete base64 audio after processing; it is not a streaming conversational session. The mobile reader currently does not expose microphone questions or this ask flow. See [story agent](C:/shibly/eudora_v2/services/api-service/src/stories/story-agent.service.ts:69).

| Meaning of “voice-featured interactive storybook” | Architectural consequence |
| --- | --- |
| Read-aloud with page turns or authored interactions | Pre-generated, reviewed narration is the main path. No microphone is needed merely to play it. |
| Child asks questions about the current story | Requires recording/permission states, transcription, bounded answers, turn cancellation, latency handling, and a data policy. Existing backend calls are a candidate to validate. |
| Continuous conversation or character dialogue | Requires a separate evaluation of streaming, interruption, session lifecycle, voice consistency, and usage controls. Do not assume the existing request/response agent provides it. |

These alternatives are not a decision to omit voice interaction. The intended interaction must be selected during review. A reasonable candidate to evaluate is authored picture books with pre-generated narration and bounded, story-grounded questions if spoken questions are central to Moon's promise.

Current official ElevenLabs documentation confirms a TTS endpoint returning audio plus original/normalized character timing information. That supports the existing general approach but does not prove alignment quality for Moon's language, punctuation, and expressive tags. Validate the exact voice/model and display text together. [ElevenLabs speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps).

If continuous conversation is selected, ElevenLabs also documents private agent sessions using a server-issued signed URL. That is an option to compare with the current orchestration, not a required migration. Provider keys should remain server-side. [ElevenLabs WebSocket authentication](https://elevenlabs.io/docs/eleven-agents/libraries/web-sockets).

The current speech wrapper automatically falls back to Gemini, potentially changing voice and losing word timings. For a finished story, a different voice or unsynchronized text is a product decision, not an invisible technical success. Prefer reviewed narration before publication. Agree on explicit degraded behavior for live answers, such as a visible retry or a readable answer with narration recovery. See [speech fallback](C:/shibly/eudora_v2/services/api-service/src/ai/speech.service.ts:56).

Voice validation must also cover:

- Current account/model availability, target-language pronunciation, named characters, expressive continuity, timing accuracy if used, device audio quality, latency, and measured cost. Historical latency/quota claims in comments are not current measurements.
- Authenticated usage limits as well as public-demo limits. The current agent caps demo conversations and daily demo turns; signed-in calls have no equivalent story-specific allowance. Generic IP throttling is not a per-family voice budget.
- Input/output handling beyond prompt instructions. The current agent uses story grounding, but a prompt alone does not demonstrate reliable topic boundaries, spoiler prevention, or age-appropriate answers. Evaluate off-topic/adversarial inputs and friendly recovery using reviewed material before release.
- Consent/guardian controls appropriate to the chosen audience and launch markets, transcript access, retention/deletion, and provider data flows. The code stores question/answer text; not persisting a recording locally does not mean providers retain no data. ElevenLabs documents default retention and enterprise eligibility for zero retention. Verify the selected account and every provider separately. [ElevenLabs retention documentation](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode).

**5. What transfers from Academic mobile**

| Reuse candidate | Qualification |
| --- | --- |
| Expo/React Native foundation, navigation patterns, UI primitives/theme, secure token storage, API refresh handling | Good starting material, subject to native validation and removal of Academic assumptions at the boundary. |
| Guardian/child selection and identity screens | Reuse access behavior; redesign onboarding around Moon's audience and necessary data. Do not bring in grade/course selection by default. |
| Standalone library and segment reader | Real accelerants: illustrated pages, narration, paging, accessibility labels. The current reader is a basic component, not the final Moon experience. |
| Audio utilities and bundled feedback | Reuse relevant mechanics. Clio persona, educational feedback, and voice style require an explicit Moon decision. |
| API caching, version gate, notifications | Useful patterns. Existing cache is not offline book storage; version and notification routing must distinguish apps before rollout. |
| Courses, homework, assessment widgets, classroom/teacher screens, grades, live classes, TV pairing, Academic rewards | Preserve in paused Academic. Exclude from Moon's critical path unless a later concrete requirement calls for them. |

Prefer a separate Moon app identity and focused navigation while retaining Academic's project/history for a possible restart. The [current app configuration](C:/shibly/eudora_v2/mobile/app.json:3) defines one generic Eudora app identity; it does not establish a separate Moon release. Decide the exact project/package arrangement after validating the reusable foundations. Share stable infrastructure deliberately once the reuse boundary is clear, without extracting a universal framework upfront.

Source-level gaps that matter before reuse:

- The reader attaches bearer tokens directly to image/audio requests, bypassing API refresh handling; the audio source is memoized by path. Test token expiry, signed-URL redirects, and recovery during a book. See [media source construction](C:/shibly/eudora_v2/mobile/src/features/story/StoryReader.tsx:18).
- The reader starts at page zero, displays the first asset at a fixed image height, and has no complete buffering/error/retry or recorded-question experience. Text fit, artwork cropping, interruption, and resume require product design and device evidence. See [reader](C:/shibly/eudora_v2/mobile/src/features/story/StoryReader.tsx:46).
- Existing token clearing does not establish complete logout/account-switch isolation for persisted API data. Validate adult/child switching and deletion alongside cache behavior. See [mobile state persistence](C:/shibly/eudora_v2/mobile/src/store/store.ts).
- Current mobile CI runs a typecheck. It does not prove native build, device behavior, accessibility, or store release readiness. Backend/web checks are more extensive, but were not run in this analysis. See [CI configuration](C:/shibly/eudora_v2/.github/workflows/main.yml:172).

Academic being paused should mean preserving its code and compatibility while avoiding new Academic feature work. Any shared-backend change later undertaken for Moon must assess effects on existing Academic clients and data. There is no deletion or migration proposal in this analysis.

**6. Open decisions for review**

The first six decisions determine the architecture and the scope of validation. Suggested defaults are discussion inputs, not assumptions that authorize implementation.

| Decision | Question and effect | Suggested starting point / owner |
| --- | --- | --- |
| Audience and launch context | English first and ages 7–10 with more independent reading are confirmed. Launch markets, phones/tablets, and operating systems still need selection. | Validate layouts and voice for the confirmed audience; select a device matrix. Product/content. |
| Core interaction | Narration plus taps, spoken questions, continuous conversation, branching choices, or some combination? Which is essential to Moon's identity? | Authored books and reviewed narration; evaluate bounded questions if essential. Product. |
| Content supply and visual scope | Curated originals/licensed books, human/AI-assisted authoring, or runtime personalized generation? How many complete books and who approves them? Are animation, character voices, or synchronized highlighting required? | Curated releases with named editorial and art owners. Content/design. |
| Account and child model | Shared Eudora family account? Guest reading? Shared devices? Which child fields are necessary? Who can view conversations, and what does account deletion mean across apps? | Shared adult identity/relationship enforcement and minimal child data. Product/backend/privacy. |
| Connectivity | Must complete books work offline, or only online with graceful recovery? Is live conversation online-only? How should access expiry interact with downloaded books? | Separate reading/download promises from live voice. Product/mobile. |
| Editorial governance | Who may draft, preview, approve, publish, and support Moon? Should an Academic teacher have any Moon access? | Explicit Moon privileges and release ownership. Content/backend. |
| Operational constraints | What hosting is actually in use, what staffing is available, and what latency, reliability, voice cost, and support targets are acceptable? | Establish budgets from measurements; do not infer live infrastructure from repository deployment files. Engineering/product. |
| Cross-app scope | Which data/settings are shared versus product-specific? Are notifications, rewards, and progress independent? | Shared family identity; product-specific progress and messaging unless deliberately bundled. Product. |
| Launch and pause management | Target date, launch catalog, support owner, and baseline Academic commitments? What would restart Academic or trigger the next app? | Ship Moon against agreed quality gates; keep other products as placeholders. Product/engineering. |

**7. Proposed validation work after this plan is reviewed**

These are bounded investigations. Local foundation validation has started following the instruction to proceed; the validation report identifies completed checks and remaining work. Provider spending and user studies have not started. Initial effort bands below are engineering estimates for planning, not delivery commitments; device, account, content, and reviewer availability can change them.

| Validation | Method and deliverable | Decision it resolves | Indicative effort |
| --- | --- | --- | --- |
| Content/page fit and editorial walkthrough | Map three representative books, including a longer page and dialogue, onto the current story model. Walk a content editor through draft, art, audio, preview, and revision; verify imported text against the original prose and record missing operations. | Segment-as-page versus explicit scenes; exact authoring work and content production capacity. | 1–2 person-days |
| Voice quality and interaction | Use approved sample text and synthetic/adult test questions in target languages. Measure representative and slow-case latency, timing quality if needed, failed/cancelled calls, pronunciation, provider limits, and cost per book/reading session. Compare streaming only if selected. | Voice/provider/model choice, supported interaction, budget, and fallback behavior. | 1–3 person-days |
| Mobile experience and media lifecycle | Exercise existing reader/auth on representative iOS/Android devices as applicable: small screen, interrupted audio, background/resume, slow/lost network, expired token, and family switching. Produce a usability/failure-state matrix. | Reuse confidence, required native work, and connectivity commitment. | 1–2 person-days |
| Publication and media integrity | Validate standalone draft previews; simulate text edits during narration, partial generation, published revisions, withdrawal, course/item deletion, and active readers. Inspect private media access in a test environment. | Minimum release/version/job contract, story lifetime, and storage delivery design. | 1–2 person-days |

A useful operating-cost model is: **content production and review + narration generation/regeneration + per-session transcription/answer/speech + media delivery/storage + support**. Measure repeats, retries, fallback use, and the expected book catalog; raw TTS price alone will understate costs. No cost figure or provider subscription is committed here.

Spikes should produce evidence, rejected alternatives, and a small architectural decision record. If the proposed reuse fails a critical experiment, revise this plan before committing to structural changes. Do not build every spike into a permanent product subsystem.

**8. What a finished Moon release must demonstrate**

After the above decisions, turn these outcomes into an agreed acceptance matrix with measurable targets. Release scope may be narrow; the selected journeys must be complete.

| Journey or responsibility | Required evidence |
| --- | --- |
| First use and family management | Understandable adult/child onboarding, recovery from login failure, correct child selection, and controls matching the chosen account model. |
| Discover → read → return | A complete, reviewed launch catalog; readable text and well-framed artwork on the target devices; reliable loading, navigation, and return/resume behavior. |
| Audio | Consistent narration, clear playback state, sensible interruption/background behavior, and recoverable media failure. No promise of usable audio merely because an audio key exists. |
| Interactive voice, if selected | Clear permission and recording states; visible listening/thinking/response feedback; cancel/retry; bounded answers; understandable quota/offline behavior; measured latency and cost. |
| Accessibility and illustration | Screen-reader labels, usable controls/text scaling, contrast, readable layouts, text access when sound is unavailable, and reduced motion if motion is added. |
| Content operations | An editor can prepare and release a complete illustrated/narrated book without developer database edits; failed jobs are visible; revisions do not break the released book. |
| Data and access | Verified guardian/staff permissions, private media where required, cache isolation, appropriate retention/deletion, and no unintended cross-app access or messaging. |
| Support and deployment | App-attributed failures and usage metrics, monitored provider/storage failures, cost limits, backups/recovery, compatible API changes, native release builds, and a rehearsed rollback path. |

Suggested measurements to agree before implementation include time to a usable first page, audio start delay, voice turn latency, media/voice failure rate, crash-free sessions, author time per finished book, and cost per active family. Set targets against the actual audience, devices, and network conditions; this assessment supplies no measured baseline.

**9. Review sequence and implementation boundary**

1. Review the recommended backend/story/mobile boundaries and answer the first six open decisions. Record the essential Moon experience and explicitly deferred features.
2. Select the validation work needed to settle remaining uncertainty. Review results and amend content, access, voice, and operational contracts before committing to a structure.
3. Once the plan has been reviewed and implementation is authorized, prepare a dependency-ordered delivery plan: complete editorial release → family access and discovery → reader and narration → selected interactions → operational and release acceptance. Independent work can run in parallel against agreed contracts.
4. Release only when the selected journeys meet the finished-product standard. Expand the catalog and future app line from observed needs; do not make Moon depend on completing a general EdTech platform.

The plan has moved into targeted implementation. The shared-backend publishing workflow and a separate initial Moon mobile reader have been implemented; the Academic app remains paused. Remaining product decisions, device validation, live voice, operational work, and store-release readiness are tracked in the validation report.
