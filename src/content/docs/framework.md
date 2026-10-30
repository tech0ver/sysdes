---
title: Framework
description: How to run a system design interview step by step, from the first question to the wrap-up, and what each step leaves on the board.
sidebar:
  badge: WIP
---

A design interview gives you about an hour to turn a vague task into a working system and defend every choice in it. A framework tells you what to do at each moment of that hour, what to ask, and what to leave on the board.

## How a design interview runs

The interviewer gives a short task: "Design a notification service. Other teams call it to send push notifications, SMS, and email to users." The task is vague on purpose. How many users, which messages, and how fast they must arrive are for you to find out.

The interview lasts 45 to 90 minutes. Introductions and your questions at the end take 5 to 15 of them, and the rest goes to the design.

You lead the interview: ask the questions, make the decisions, draw, and say what comes next. The interviewer probes: asks why, changes a requirement, or pushes you into one component. The less the interviewer has to steer you, the stronger the result.

An hour is too short to design a real system, and the interview does not ask for one. The interviewer has a system in mind and the problems it should lead to. You find that system by asking questions, and you show how you would build it by suggesting options, discussing them, and explaining your choices. The interviewer judges this as much as the design.

The interviewer looks for five things:

- A working system. By the end, every core scenario has a path through the design. Running out of time with half a system built is a common way to fail.
- Decisions with reasons. Each choice comes with the reason for it and the option you turned down.
- Numbers that change something. An estimate counts only when a decision uses it.
- Depth where it matters. Where the requirements are hard, you go below the boxes: the data model, what fails, where the limits are.
- A board that reads without you. Someone who missed the talk can follow the requirements, the numbers, and the design.

Cover every step briefly, and go deep in two or three places. You pick the places, and the choice is part of what the interviewer judges.

The steps below are a default order. Each range is the time for the step in a design part of 35 to 75 minutes: take the low end in a short interview. An optional step depends on the interviewer and the system, and a skipped step gives its time to the deep dives.

| Step | What stays on the board | Minutes |
|---|---|---|
| Opening | The task in your words, the plan, what already exists | 1–3 |
| Functional requirements | Three to five scenarios, what is out of scope | 3–5 |
| Non-functional requirements | Qualities with numbers, ranked | 3–5 |
| Estimates | Rates and sizes, each with the decision it feeds | 1–5 |
| API and entities | One call per scenario, the main entities | 3–7 |
| Data flow (optional) | The stages data goes through | 0–5 |
| High-level design | Components, the path of each scenario, the data in each store | 8–15 |
| Key part and technologies | Load and keys of the key data, products with reasons | 5–10 |
| Deep dives | Two or three problems solved in depth | 8–20 |
| Resources (optional) | Servers per component | 0–5 |
| Cost (optional) | The main cost item, a monthly total | 0–3 |
| Operations (optional) | What fails and what you do, how you release | 0–7 |
| Wrap-up | Which requirements are met, what comes next | 1–3 |

## Defending a decision

Halfway through the design you put a queue in front of the senders, and the interviewer asks why. A full answer has four parts: the decision, the reason from the requirements or the numbers, the option you turned down, and when that option would win. "A queue, because a provider can be slow for minutes and callers must not wait for it. Calling the provider directly is simpler and wins when the caller needs the result in its response."

Give the reason when you make the decision, before anyone asks. A choice explained only under questioning looks like a guess.

Lead with the technical answer, and add the cost after it. Asked how many copies of the data to keep, say how many, where they live, and which failure they survive. Then say what the copies cost and where you would save, such as fewer copies of data you can rebuild.

Every number you assume needs a source: the interviewer said it, you derived it from another number, or you know it from a similar system. When the interviewer gives no number, say your assumption aloud with its source and ask whether it fits: "Every team in the company sends through us, so assume the whole user base, about 50 million people. Is that the right scale?"

When two options are close, name both, pick one with a reason, and ask whether the interviewer wants to go the other way. The interviewer often has a direction in mind and will tell you. When you do not know a detail, say what you would check and which assumption you use until then.

The interviewer will interrupt: ask about a component before you reach it, or change a requirement. Answer, then say where you were and go back to the plan. When the change breaks an earlier decision, say which one and fix it on the board. A question about a component often means the interviewer wants depth there.

:::avoid
"It depends" as the whole answer. Name what it depends on, pick an option for the requirements you have, and say what would change the choice.
:::

## Opening the interview

The first minutes decide what you build and how the hour goes. Spend one to three of them here, before the first requirement.

Restate the task in one sentence, in your own words: "A service that other teams call to deliver a message to a user by push, SMS, or email." If you misread the task, the interviewer corrects you now, not after twenty minutes of design.

Say the plan: the steps you will go through, in order, with the optional ones marked. The interviewer now knows where you are going and can change the route early: "Skip the API, I care more about delivery."

Ask what already exists: a message queue, a user database, or an auth service you can call, or an old system you must work with, along with its limits. Most tasks start from scratch, and the usual answer is "assume standard infrastructure". The question still pays off: you can treat the parts outside the task as given and spend the time on its core.

The opening leaves three lines in the corner of the board, and they stay there for the whole interview:

::diagram{name="framework-opening"}

:::avoid
A long list of questions in the opening. The opening needs three things: the task in your words, the plan, and what already exists.
:::

## Functional requirements

Functional requirements say what the system does for the people and services that use it. They set the scope of the hour: everything you design later serves one of them. The step takes three to five minutes.

Start with who uses the system. A notification service has two sides: the teams that send messages and the users who receive them. Then write the scenarios as short sentences with an actor and an action. Propose them yourself and ask the interviewer to confirm or reorder: "These are the scenarios I see. Which ones matter most to you?" An open "What should it do?" hands the lead to the interviewer.

Of three to five scenarios, keep the two or three you will design. Write the rest after "Out:" as out of scope: the interviewer sees that you know about them and chose to leave them out. When the interviewer agrees on the core scenarios, move on. <!-- link: fundamentals/requirements -->

::diagram{name="framework-functional"}

:::avoid
Qualities in the list of scenarios, such as "sending is fast" or "nothing is lost". A scenario is an actor and an action.
:::

## Non-functional requirements

Non-functional requirements say how well the system must do its job: how fast, how reliably, at what scale. They decide most of the design. Two systems with the same scenarios look different at a thousand and at a billion messages a day. The step takes three to five minutes.

Walk through a short list of qualities and keep only the ones that change the design:

- Scale: how many users, how many requests, how much data, and how high the peaks go.
- Geography: where the users are, and whether the system must keep working when a whole region fails.
- Latency: how fast each operation answers or takes effect.
- Availability: how much downtime is acceptable.
- Consistency: whether a reader must see the latest write, or can see an older value for a while.
- Durability: whether data may be lost, and how much.
- Others this system needs: order of messages, duplicates, privacy, cost.

Attach each quality to an operation. Sending a message and checking its status need different answers: a lost message is a failure, but a status that lags by a few seconds is not.

Give every quality a number. "Fast" becomes "accepted within 100 ms for 99% of requests", and "highly available" becomes 99.99%, about four minutes of downtime a month. A number is what lets a later decision use the requirement. Propose the numbers and ask whether they fit, as with any assumption.

Rank the qualities, because they conflict. Waiting for more copies of a write makes it safer and slower. Showing the latest data during a network failure may mean refusing the request. The ranking says which quality wins when two of them meet, so you do not argue it again in every component. <!-- link: fundamentals/requirements -->

::diagram{name="framework-non-functional"}

:::avoid
"Scalable, available, fast" with no numbers and no ranking. It fits any system, so no decision can use it.
:::

## Estimates

Estimates turn the scale from the requirements into the numbers that decisions use: requests per second, data size, and how reads compare to writes. The step takes one to five minutes.

Many interview guides teach a full estimate right after the requirements. At that point there is no design yet, so many of the numbers never reach a decision. Count in two passes. Right after the requirements, find the order of magnitude of the main numbers. Count the details later, in the time of the decision that needs them: how many nodes, how much memory for a cache. <!-- link: fundamentals/requirements -->

:::explain
"I will give the scale as rough numbers now and count the details when a decision needs them. Do you want the full estimate now?" If the interviewer says yes, count it now, and still write each number next to the decision it feeds.
:::

Write next to each number the decision it feeds. If you cannot say what a number changes, skip it.

Numbers can also keep a design small. A thousand writes a second and a few gigabytes of data fit one database node with a copy for failover. Say so, and do not split the data.

::diagram{name="framework-estimates"}

:::avoid
Numbers with no decision next to them. They take time and tell the interviewer nothing about the design.
:::

## API and entities

The API is the boundary of the system: what callers send and what they get back. Fixing it now gives every later component a clear job, and the interviewer sees the system from the outside before you open it. The step takes three to seven minutes.

Start with the entities, the main things the system stores and passes around, and name them.

Then write one call per core scenario: the operation, its input, and its output. Use the API style the callers expect, usually REST over HTTP, and switch only when a scenario needs it, such as a stream of events to the client. <!-- link: technologies/api-styles --> For each call, check three things:

- Who calls it, and whether it may. Take the caller's identity from its auth token, not from a field in the request, then check that this caller may do this action on this object. <!-- link: fundamentals/security -->
- What happens on a retry. A caller that timed out sends the request again, so a write takes an idempotency key, and a retry with the same key does not repeat the effect.
- How much it returns. A list grows without limit, so it comes in pages.

When a call starts work that takes longer than the caller waits, it returns at once with an ID, and the caller checks the result later.

Split the calls into two groups. The **data plane** is the path that does the system's job at full load, such as sending a message. The **control plane** changes how the system works, such as settings and accounts: it gets far fewer requests and can be slower. The two get different requirements, and the data plane must keep working with the settings it already has when the control plane is down. <!-- link: fundamentals/failures -->

Write the calls in a short form, and say once that it is a sketch: "This is a sketch of the API. I can write out the exact fields if you want." Any form works if the interviewer can read it, and the one below fits a board. A call is its method and path, the body, and the answer after the arrow. Name the auth once, above the calls. Add a header only when it changes what the call does, such as the idempotency key. Write a status code or a type only when it is not the obvious one: `202` says that the request is accepted and the work is not done yet.

::diagram{name="framework-api"}

:::avoid
Every endpoint and every field. Write the calls for the core scenarios, with the fields the scenario needs.
:::

## Data flow

Some systems are pipelines: data enters, passes through several stages, and leaves changed or delivered. A message to a user is accepted, checked against the user's settings, built for a channel, sent, and recorded. Before you draw the design of such a system, list its stages. A system that answers each request in one pass, such as a store of user profiles, has no stages worth listing: skip this step and give its time to the deep dives. For a pipeline, the step takes up to five minutes.

You decide on this step yourself. Say it in one sentence, and the interviewer can still ask you to skip it: "Messages pass through several stages, so I will list them before I draw."

Write the stages in order as verbs, with what enters and leaves each one. What leaves a stage enters the next, so write a chain: what enters the first stage, then each stage with what it passes on. Mark two kinds of places. Where a stage can be slower than the one before it, data has to wait, and the design must keep it somewhere. Where a stage calls something outside the system, it can fail: a temporary failure is retried without losing the data, and a permanent one, or a timeout that leaves the result unknown, needs its own outcome. <!-- link: fundamentals/messaging -->

::diagram{name="framework-data-flow"}

:::avoid
Boxes and products at this step. A stage says what happens to the data.
:::

## High-level design

The high-level design is the first working system: every core scenario has a path through it from the caller to the data and back. It meets the functional requirements. The interviewer checks it first, so finish it before you go deep anywhere. The step takes 8 to 15 minutes.

Build it one scenario at a time, in the order of the API. For each call, draw the path it takes, and add a component only when the path needs it. When the right choice is well known and its reason fits in one sentence, draw it at once and name the simpler option you skipped: "Sending must not wait for the providers, so a queue goes between them. The API could call the provider itself, but then the caller would wait for the provider and could miss the 100 ms to accept." When the choice takes several components or depends on numbers you have not checked, draw the simple version, mark the place, and keep it for a deep dive.

Draw classes of components, such as a service, a database, a queue, or a cache. A class says what the component must do.

When a path first stores data, give the data a shape. Next to the store, write what it keeps, the fields this path needs, and the key the path reads by. The way the path reads the data picks the shape. Rows found by different fields or joined with other rows make a table. A whole object fetched by one key is a key-value pair or a document. Large binary data goes to files under a path. A later path that uses the same store adds its own fields. <!-- link: fundamentals/databases -->

Write the data so that its form shows the shape, with no label. Give a type only where it is not obvious, such as the values of a status:

- A table: the name, a line, then the columns, with the key marked. A column that the main query reads in order, such as a time, is marked `(sort)`.
- A key-value pair: `settings:{user_id} -> {channels}`, with placeholders in braces, as in the API paths.
- A cache: a key-value pair, plus how long an entry lives and which entry leaves first when memory is full: `TTL 1 min, LRU`.
- A document: the nesting in braces, `order {id, items: [{sku, qty}]}`.
- Files: the path, `media/{user_id}/{file_id}.jpg`.
- A queue keeps data too: what a message holds and how long it stays, `{order_id, items}, kept 7 days`. When order matters, add the key of the messages that must stay in order: `key user_id`.

Draw the path where everything works first. Then walk it again and ask at each arrow what happens when the next component is slow or down. Find the point where a request counts as accepted, and check what happens when a failure hits between two writes on the path. Mark the answer on the board in one line: a retry, a fallback, a message that waits.

When reads and writes take different paths, draw both. The control plane can stay one box next to the data plane: it rarely decides the design.

Keep the board readable. Name each box by its job, label each arrow with what it carries, and number the steps of a path when the order matters.

::diagram{name="framework-hld"}

:::avoid
Going deep into one component before every core scenario has a path. If time runs out there, the system does not work end to end.
:::

## The key part and choosing technologies

With a working system on the board, find the component where the hardest requirements meet: it carries the peak load, keeps the data that must not be lost, or has to satisfy two requirements that conflict. Usually it is one component, rarely more than two. Name it and say why: "The hard part is accepting a hundred thousand messages a second without losing one." The step takes 5 to 10 minutes.

The data on the board already has a shape, fields, and a key. For the key component, go further: how many reads and writes the data gets, in what order it is read, and how long it is kept. The main query picks the primary key. When the estimates showed that the data does not fit one node, the main query also suggests the key that spreads the data across nodes. Check that this key spreads the load evenly, with no hot key that gets much more traffic than the rest.

Then turn each class on the board into a product, starting with the key part. Choose in four moves:

1. The class from the high-level design, such as a queue or a database.
2. The properties the requirements ask of it: how much load, what must survive a failure, what order, the shape of the data and how it is read.
3. A product that has those properties.
4. The alternative, and when it would win.

Name open-source products by default. They run anywhere, in your own data centers or in any cloud, and you can explain how they work inside. A managed cloud service hides that work: the interviewer may not know it, may ask you to explain its insides anyway, or may rule it out. Offer it as the alternative where it fits: it spares the team that would run the cluster, and you pay for every request and gigabyte.

The interviewer will ask how the product keeps copies, what happens when a node fails, and where it stops scaling. Prefer a familiar product you can defend to a better one you cannot explain. (More on [choosing a database](../fundamentals/databases/).)

::diagram{name="framework-key-part"}

<!-- link: technologies/kafka --> <!-- link: technologies/rabbitmq --> <!-- link: technologies/cassandra -->

:::avoid
A product with no property behind it. "We use Kafka" says nothing until you add what the requirements needed from it.
:::

## Deep dives

Deep dives take the most time and decide the level of the result. A deep dive takes one hard problem of the design and solves it in full. The deep dives get 8 to 20 minutes, whatever is left after the time you keep for the optional steps.

Before the first deep dive, ask which of the optional steps the interviewer wants, and keep time for them at the end: "After the deep dives, I can count the servers, estimate the cost, and cover operations. Which of these do you want? I will keep the last ten minutes for them." The optional steps come after the deep dives because they count and run the design you end with. Give each deep dive its share of the remaining time, and when the share runs out, close the deep dive with the choice made and move on.

Propose the deep dives yourself. Starting from the key part, name two or three problems where the requirements are hardest, and ask which one to take first: "I see three hard spots: not losing an accepted message, not sending a message twice, and a provider that is down for an hour. Where do you want to start?" The interviewer may pick one of yours or bring another. Either way, the list shows that you see the problems before anyone points at them.

Solve each problem the same way. State it with its numbers. Draw the part of the design it lives in, larger, number the steps, and mark where it breaks. Give two or three options with what each costs, from the simplest to the one that meets the requirement. Pick one, change the design on the board, and say what the choice costs and when you would revisit it. This is the defense of a decision at full depth.

The problems repeat across systems of one type, so knowing the type tells you where to look:

| Type of system | Usual deep dives |
|---|---|
| Short links, IDs, counters | [Unique IDs](../patterns/unique-ids/), hot keys, [a cache in front of the store](../fundamentals/caching/), counting at scale <!-- link: patterns/counting --> <!-- link: systems/url-shortener --> |
| Feeds and timelines | Fan-out on write or on read, accounts with millions of followers <!-- link: patterns/news-feed --> |
| Chat and real-time | Long-lived connections, order of messages, offline users, groups <!-- link: patterns/real-time --> |
| Nearby search and maps | Proximity search, a high rate of location updates <!-- link: patterns/proximity-search --> <!-- link: systems/ride-hailing --> |
| Booking and tickets | Two people taking the same seat, [holds that expire](../patterns/reservations/) |
| Payments and balances | Charging exactly once, a ledger, reconciliation <!-- link: patterns/ledger --> |
| Pipelines and notifications | Delivery guarantees, retries and duplicates, slow external services <!-- link: patterns/async-processing --> |
| Search and autocomplete | Building the index, prefix lookup, ranking <!-- link: patterns/search --> |
| Rate limits, locks, schedulers | Counting across nodes, a lock that outlives its holder, missed runs <!-- link: patterns/rate-limiting --> <!-- link: patterns/distributed-locks --> <!-- link: patterns/job-scheduling --> |
| Storage systems | [Splitting data across nodes](../fundamentals/sharding/), [copies](../fundamentals/replication/), consistency, failover |
| Media | Large uploads, processing in stages, delivery through a CDN <!-- link: patterns/large-files --> |

::diagram{name="framework-deep-dive"}

::diagram{name="framework-deep-dive-design"}

:::avoid
Waiting for the interviewer to pick a problem, or going deep where nothing is hard. Both leave the hardest part of the system unexplained.
:::

## Resources

Resources turn the numbers into machines for the design you ended with. The step shows whether that design can run at all. It is optional and takes up to five minutes.

Count only the components that are big, usually the key part and whatever takes the peak load. Say what one server is, as an assumption: "I count in servers of 16 cores and 64 GB of memory." For each component:

1. Find the dominant resource, the one that runs out first: CPU for encryption and serialization, memory for a cache, disk for a store that keeps months of data, network for media.
2. Divide the load by what one server gives of that resource.
3. Add room for failure. A system that must survive losing one of three zones runs each zone at most two-thirds full, so it needs half again as many servers.

Then check the latency budget. Add up every step the caller waits for on the path of a request, from the network to the user to the slowest store, each at the percentile of the requirement, and compare the sum with it. The sum is a rough budget: different requests are slow at different steps, so the real percentile is measured end to end. When the sum is over, the design changes: fewer hops, a cache, or work moved out of the request. <!-- link: fundamentals/requirements -->

::diagram{name="framework-resources"}

:::avoid
Servers for every box. Small components get "a few servers" and no more of your time.
:::

## Cost

Cost shows what the design asks for in money each month, and where money should change the design. It is optional and takes up to three minutes.

Say where the system runs, as an assumption: cloud instances or your own servers. The two are priced differently: in a cloud you pay for each instance and for each gigabyte stored and sent, while your own servers cost money to buy and people to run.

Find the main item first. One item is often most of the bill, and it is not always the servers: fees for each paid message, data sent out to users, or logs kept for months. Multiply the amount from the estimates and resources by a round unit price, and give one total with the main item named. <!-- link: fundamentals/requirements -->

When one item dominates, look for a design change that cuts it, and offer it to the interviewer, since it may change a requirement: "SMS is most of the bill. Can a message try push first and fall back to SMS?"

::diagram{name="framework-cost"}

:::avoid
A sum of every component to the last dollar. Name the main item and the total; the rest is rounding.
:::

## Operations

Operations show how the system lives after launch: what fails, how you find out, and how you change it without breaking it. The step is optional and takes up to seven minutes.

Start with failures. For each key component, write what fails, what users see, and what the system does. The high-level design and the deep dives already answered many of these, so this step collects the answers and adds the failures of whole zones and regions. <!-- link: fundamentals/failures -->

Turn the non-functional requirements into targets you measure. The availability and latency numbers become the goals for the service, and alerts fire when users feel a problem, such as more errors or slower answers, rather than on every busy CPU. For each class of component, name what you watch: requests, errors, and latency for services, lag for queues, free space for stores. Logs and traces cost money to keep, so keep a sample. <!-- link: fundamentals/observability -->

Say what the system gives up under overload. When load exceeds what the servers can take, decide what waits or gets dropped first, such as low-priority work, and how one caller is kept from using up the capacity of all the others. <!-- link: patterns/rate-limiting -->

Say how a change reaches production. A new version goes to a few servers first, then to one zone at a time, while you compare its errors and latency with the old version and roll back when they get worse. A new feature hides behind a flag, so you can turn it off without a release. A change to stored data goes in steps that keep the old and new versions working together. <!-- link: practices/releases --> <!-- link: patterns/data-migration -->

::diagram{name="framework-operations"}

:::avoid
A list of monitoring tools with nothing about what you watch. The interviewer wants the signals and the actions, and any tool can carry them.
:::

## Wrap-up

Keep the last one to three minutes for the wrap-up. Walk the requirements on the board, one by one, and say which part of the design meets each. Where one is met only in part, say so and what is missing.

Then say what comes next: the scenarios you left out, the optional steps you did not reach, and what breaks first when the load grows ten times. Add no new components at this point. When the interviewer runs over time, give the wrap-up in one sentence.

For the notification service, it sounds like this: "All three scenarios work, and the status lags by a few seconds. An accepted message is not lost in an outage shorter than 7 days: the queue keeps it that long, in three copies. Accepting meets its numbers, and delivery meets its times while the providers answer on time. Next come templates, and at ten times the load, a separate queue per channel."
