---
title: Reservations
description: How a system sells a limited stock of rooms, seats, or time without selling one unit twice, from counts per night to holds, expiry, payment, overbooking, and hot sales.
---

Every system that sells something limited, such as rooms, seats, products, or a driver's time, must never promise one unit to two buyers, even when they arrive in the same second and pay minutes later. To design and defend such a system, you need to know how to model the stock, hold it while a buyer decides, give it back when they leave, and keep it correct when everyone comes at once.

## Counting interchangeable units per period

A booking site sells stays in hotels. A guest asks for a double room in hotel 12 for three nights, June 10 to June 13, and does not care which double room it is. The hotel promises a room type, not room 301, and the front desk hands out a key at check-in. So the site sells a number: the hotel has 20 double rooms, and on each night at most 20 stays may include one.

When buyers do not care which unit they get, the stock is a count. Keep one row per unit type and period with two numbers: how many units exist and how many are taken. This row is the **inventory** of that type for that period, and every sale changes it.

```sql
CREATE TABLE inventory (
  hotel_id     bigint,
  room_type_id bigint,
  night        date,
  total        int NOT NULL,
  taken        int NOT NULL DEFAULT 0,
  PRIMARY KEY (hotel_id, room_type_id, night),
  CHECK (taken BETWEEN 0 AND total)
);
```

A stay of several nights needs one unit on every night, and gets all of them or none. One transaction raises the count of each night with an atomic update that keeps the rule in `WHERE`, and writes the booking:

```sql
UPDATE inventory
SET taken = taken + 1
WHERE hotel_id = 12
  AND room_type_id = 3
  AND night >= '2027-06-10'
  AND night < '2027-06-13'
  AND taken < total;
-- 3 rows
```

The check-out day is not in the range: the guest leaves that morning, and the room is free for someone else that night. The transaction expects one changed row per night. If fewer rows change, a night is full or not on sale, and the transaction rolls back, so no guest ends up with two nights of three. Two stays that share nights lock the same rows, and one statement locks its rows in an order the database picks, so two such updates can deadlock. Lock the nights in date order first with `SELECT ... ORDER BY night FOR UPDATE`, or retry the transaction the database aborts (more on [deadlocks](../../fundamentals/transactions/#waiting-for-each-other)).

::diagram{name="night-counts"}

The total changes over time. A room closed for repairs lowers it for those nights, and a new wing raises it. Lowering it is a guarded update too: the total cannot drop below the rooms already taken.

A night can be sold only if its row exists. The site keeps rows for a fixed horizon, such as two years ahead, and a daily job adds the next night for every hotel and room type. The job inserts with `ON CONFLICT DO NOTHING`, so a second run after a crash adds nothing twice. A missing row makes the update change fewer rows than there are nights, so the horizon also sets how far ahead guests can book. Past nights move to an archive.

Such a table stays small, and few transactions write it. In an interview exercise with 5,000 hotels, 20 room types each, and two years ahead, it has 73 million short rows, which one database server holds. With a million rooms, 70% of them taken, and three-night stays, the site makes about three bookings per second ([Xu, Lam](https://www.amazon.com/dp/1736049119)). When such traffic spreads over many hotels and nights, two bookings rarely meet on one row, and atomic updates in one database are enough. A hotel that everyone books at the same moment is a different case.

Handing out the concrete room late keeps options open. If each booking got a fixed room at once, the calendar would break into gaps: a three-night stay could find a free double room on every night, but a different one each night, and be refused. With counts, the site accepts any stay that fits under the total on each night, and such stays always fit into rooms. Each stay is an unbroken run of nights, so the front desk can hand out rooms in order of arrival, giving each guest any room whose last guest has left, and nobody has to change rooms. This holds while the rooms of the type stay the same for the whole period and none of them is promised to a particular guest: a room closed for two nights in the middle of the calendar can break it.

::diagram{name="late-room-assignment"}

The count fits any stock whose units the buyer sees as the same: standing places at a concert, or a product in a warehouse, where the whole stock is one period. It does not fit a unit the buyer picks by name, such as a numbered seat.

:::do
When buyers do not care which unit they get, store a count per unit type and period, and take every period of a request in one transaction, with an atomic update that checks the count. Hand out the concrete unit as late as possible.
:::

## Booking one unit by time range

The site adds apartments. Each apartment is the only one of its kind: a guest who wants apartment 7 for June 10 to June 13 takes nothing else. There is nothing to count. The question is whether the new dates overlap any booking of this one unit.

Store each booking as a row with the unit and its period, the check-out day again left out. Two periods overlap when each starts before the other ends, so the check before an insert is:

```sql
SELECT id
FROM bookings
WHERE apartment_id = 7
  AND check_in < '2027-06-13'
  AND check_out > '2027-06-10';
-- no rows
```

Two guests run this check at the same moment for overlapping dates. Both find no rows, and both insert. Locking the result with `FOR UPDATE` does not help: the result is empty, so there is nothing to lock. The booking that breaks the rule is a row that did not exist when the other transaction searched (more on [phantoms](../../fundamentals/transactions/#a-rule-across-several-rows)). Three ways close the gap.

The first locks a row that always exists: the unit's own row. Each booking starts with `SELECT ... FROM apartments WHERE id = 7 FOR UPDATE`, then checks and inserts. All bookings of one apartment queue on that row, and bookings of other apartments do not wait. It works in any database with row locks, but the rule lives in the app: one code path that writes bookings without the lock breaks it.

The second lets the database reject an overlapping row itself. In PostgreSQL, an [exclusion constraint](../../technologies/postgresql/#keeping-data-valid-inside-the-database) on the unit and the period does this, and no code path can skip it. The cost is the choice of database: most databases have no such constraint, and it holds only for rows in one database.

The third turns time into rows: one inventory row per apartment and night with a total of 1. An overlap becomes a conflict on rows that exist, and booking is the same atomic update as for hotels. It costs a row per unit and period over the whole horizon, and it fixes the smallest step of time. That suits nights. A meeting room booked in 30-minute slots works the same way, but a booking from 10:15 cannot exist, and a long period touches many rows.

::diagram{name="range-guards"}

A period the owner closes, such as dates the host keeps for themselves, follows the same model: a blocking row in the bookings table under the same rule, or a total of 0 on those nights.

:::do
Never check for overlaps and then insert without a guard: an empty result locks nothing. Let the database reject overlaps with a constraint where it can. Otherwise, lock the unit's own row before the check, or store one row per unit and period when time already comes in fixed steps.
:::

## Holding units while a buyer decides

The site adds payment by card. Between choosing a room and paying, the guest types card details and confirms with the bank, which takes minutes. If another guest takes the last double room meanwhile, the first one fails at the very end. A hold keeps the units for the guest while they decide, as a state with an expiry stored in the data (more on [holds](../../fundamentals/transactions/#work-that-outlives-a-transaction)).

A numbered seat keeps its hold in its own row. A count has no row per unit to mark, so the hold becomes a record of its own: a booking with the units, the periods, a status, and an expiry. The transaction that creates it also raises `taken` on every night, so the units leave the shared count at once:

```sql
INSERT INTO bookings (id, guest_id, hotel_id, room_type_id, check_in, check_out, rooms, status, expires_at)
VALUES ('b-7f3a', 42, 12, 3, '2027-06-10', '2027-06-13', 1, 'held', clock_timestamp() + interval '10 minutes');

UPDATE inventory
SET taken = taken + 1
WHERE hotel_id = 12
  AND room_type_id = 3
  AND night >= '2027-06-10'
  AND night < '2027-06-13'
  AND taken < total;
-- 3 rows
```

Taking a quantity out of a shared count at once and keeping it in the holder's own record is **escrow**. O'Neil's [escrow method](https://doi.org/10.1145/7239.7265) does this inside the database, for transactions that are still running; here, short transactions and a booking record apply the same idea at the level of the app. The count then shows the worst case: even if every hold ends in a payment, nothing is sold twice. The transaction ends right away, so the count's row stays locked for milliseconds, while the hold lasts minutes. A confirmation changes only the booking's status. A release or an expiry changes the status and gives the units back with `taken - 1` on the same nights, in one transaction.

::diagram{name="hold-escrow"}

A booking moves from `held` to `confirmed`, `released`, or `expired`, and each move is a conditional update that only a booking in `held` passes:

```sql
UPDATE bookings
SET status = 'confirmed'
WHERE id = 'b-7f3a'
  AND status = 'held';
-- 1 row
```

::diagram{name="hold-states"}

This confirmation does not check the expiry, which is a choice, not a rule of counts. The deadline ends what the site promises, and marking the booking `expired` is what gives its units away. Until then, its units are still counted for it, so accepting a late confirmation takes nothing from anyone. A site that must refuse anything after the deadline adds the expiry to the condition, as a seat's hold does. When a payment and an expiry race, one of the two updates changes the row, and the other changes nothing and learns that it lost. Pat Helland calls such a step a [tentative operation](https://www.cidrdb.org/cidr2007/papers/cidr07p15.pdf): it gives the holder the right to confirm or cancel later, and a confirmation gives up the right to cancel.

::diagram{name="late-confirm"}

The guest's app creates the booking ID before the first request, so a retry after a lost answer or a double click hits the primary key and returns the existing hold instead of taking a second room (more on [retrying with an idempotency key](../../fundamentals/transactions/#retrying-a-transaction)).

A hold costs nothing to take, so one account, or a bot, can hold every double room for the weekend and let the holds run out, again and again. Cap the active holds per account and the units per hold. The cap is a rule across several bookings, so keep it as a count per account that each new hold raises with an atomic update (more on [rules across several rows](../../fundamentals/transactions/#a-rule-across-several-rows)).

A hold fits when a slow human step sits between the choice and the confirmation, and losing at the end costs the guest a lot. Without such a step, there is nothing to hold: when the guest pays at the property, or the business books first and collects the money later under its cancellation terms, one transaction takes the units and confirms the booking. When conflicts are rare, the site can skip the hold and check the count only in the final transaction, and the rare guest who loses learns it at the end.

:::do
Store a hold of a quantity as its own record, and move its units out of the shared count in the same transaction. Make every change of its status a conditional update from the status it leaves, so a confirmation and an expiry cannot both win. Let the client create the hold's ID, and cap active holds per account.
:::

:::explain
When asked to design a booking system, say where the hold lives, how the count of free units reflects it, and which update decides the race between a payment and an expiry.
:::

## How long a hold lasts

The guest has a hold. How long should it last? A short hold fails guests who are still typing their card number, and a long one keeps units out of sale after the guest has left.

The human step the hold covers sets its length. A checkout takes minutes: Shopify holds units for [several minutes](https://shopify.engineering/scaling-inventory-reservations) while a payment runs, and Ticketmaster sets the time limit of a checkout [by demand for the event](https://help.ticketmaster.com.au/hc/en-au/articles/360008668033-Why-is-there-a-time-limit-for-checking-out). A host who must accept a request to book gets a day: Airbnb gives hosts [24 hours](https://www.airbnb.com/help/article/28) to answer. A driver offered a ride gets seconds: Uber gives drivers [15 seconds](https://help.uber.com/driving-and-delivering/article/yolculuk-talebi-alma?nodeId=7162bba3-ba0b-4f76-b900-645bf43c7b07) to accept. Measure how long real guests take to finish the step, and set the hold so that most of them finish in time. Shorten it for stock that sells out fast, where every abandoned hold keeps a unit from a guest ready to pay.

The guest sees a timer, and the server's expiry is the only one that counts. Do not show a longer timer to make up for clocks that differ: the guest who pays in the last minute of a longer timer finds the hold gone. Send the seconds that remain, not a time of day, which removes the difference between the clocks. Let the app count them down on a clock that only moves forward, from the moment it sent the request, so the time the answer spent on the way is already used up, and ask the server again when the page comes back to the screen.

::diagram{name="remaining-seconds"}

A hold can be extended, but only on purpose. When the guest presses "Pay", the server extends the hold once by a fixed time, because the bank's check can take a while and an expiry in the middle of a payment is the worst moment to lose the room. The extension is a conditional update too: it passes only if the booking is still `held` by this guest and its time has not run out. A store with keys that expire needs the same care: in Redis, `EXPIRE` moves the expiry of any key, whoever holds it, so check the holder's token in the same step (more on [locks with a time limit](../../technologies/redis/#letting-one-worker-act-at-a-time)). Limit the number of extensions, or a hold that renews itself becomes a booking nobody paid for.

::diagram{name="extend-on-pay"}

:::do
Set a hold's length from the human step it covers, and make it shorter for stock in high demand. Treat the server's expiry as the only truth, show the client the remaining seconds, and extend a hold once, when the payment starts, with a check of its holder.
:::

The deadline passes, but the units of an expired hold are still counted as taken.

## Returning expired holds

A hold in a seat's own row expires lazily: the next buyer treats an expired hold as free, and nothing else has to happen. A hold of a count does not. The expired booking still has its units in `taken`, and the count says the hotel is full while rooms stand empty. An exclusion constraint keeps an expired hold too: it compares the rows that exist, and the passing of time changes no row, so the next guest's insert still conflicts with it. Someone has to write the expiry into the data.

::diagram{name="expired-hold-blocks"}

A take can do it on its own path. Give the constraint a condition, `WHERE (status IN ('held', 'confirmed'))`, so it compares only active bookings. Before it inserts, the booking of an apartment marks the expired holds that overlap its dates as `expired`, in the same transaction, and its insert no longer conflicts with them. This works where the taker can find what blocks it, such as the holds of one unit. A count of many units does not say which bookings hold them.

::diagram{name="take-expires-blockers"}

A **sweeper** is a job that finds expired holds and returns their units. It runs often, for example every few seconds, and takes a batch of the oldest expired holds:

```sql
SELECT id
FROM bookings
WHERE status = 'held'
  AND expires_at <= clock_timestamp()
ORDER BY expires_at
LIMIT 500
FOR UPDATE SKIP LOCKED;
```

For each one, it marks the booking `expired` with an update that checks the stored expiry again, and lowers `taken` on its nights only if that update changed the row, in one transaction:

```sql
UPDATE bookings
SET status = 'expired'
WHERE id = 'b-7f3a'
  AND status = 'held'
  AND expires_at <= clock_timestamp();
-- 1 row
```

A partial index on `expires_at` over the rows in `held` keeps the search short however many old bookings the table has. Small batches keep each transaction short; a batch of 500 is an example to tune. Because the move to `expired` is conditional, a hold confirmed a moment earlier stays confirmed, two sweepers do not return the same units twice, and a sweeper that crashes and runs again does no harm. The sweep interval, plus any backlog when the sweeper falls behind, is how long a dead hold keeps its units out of sale.

::diagram{name="sweep-delay"}

A timer per hold is faster. When the site takes a hold, it schedules a delayed message for the moment of expiry, and its handler runs the same conditional update. The update reads the expiry stored now, so a message for a hold that was extended since then changes nothing. A message can be late or lost, so the sweeper stays as the safety net, and the timer only shortens the wait. <!-- link: patterns/job-scheduling --> In Redis, keys can expire with the hold, and Redis can announce each expired key, but the event comes when Redis deletes the key, which may be well after its expiry, a client that is disconnected misses it, and in a cluster each node sends only its own events ([Redis](https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/)). Such an event is a hint to sweep now, not the only path.

::diagram{name="timer-and-sweeper"}

A returned unit must also reach the guests who look at the hotel. The counts they see in search come from copies, and a return updates them like any other change of the count.

:::do
Return the units of expired holds with a sweeper that uses an index on the expiry and short batches, and make its update pass only for a hold that is still active. Where a take can find the holds that block it, it can expire them itself. Add a timer per hold to return units sooner, but never as the only path.
:::

## Paying for a hold

The guest presses "Pay". The payment provider is another company's system: it cannot take part in the site's transaction, and a charge cannot be rolled back, only refunded. The order of steps decides what happens when the hold and the payment disagree.

Cards let the site split a payment in two. An **authorization** reserves the amount on the guest's card without moving money, and a **capture** later takes it. Cancelling an authorization moves no money at all. An authorization runs out if nobody captures it: for an online card payment, usually after [seven days](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method), and the provider reports the exact deadline for each one. The steps then go:

1. Extend the hold, and record a payment attempt with its own ID.
2. Authorize the amount.
3. Confirm the booking in the database, with the conditional update from `held`.
4. Capture the amount, right away.

Each call to the provider gets its own idempotency key, made from the attempt's ID and the step, so a retry of the capture does not repeat the authorization. The confirmation in step 3 is the site's decision: before it, every step is undone by cancelling the authorization; after it, the booking stands, and the capture is retried. The transaction that confirms the booking also records that a capture is due, so a crash right after the commit does not leave the capture unsent. <!-- link: patterns/async-processing --> A capture can still fail for good, for example when the card is closed. If the business then keeps the booking and collects the money another way, step 3 is the pivot. If its terms let it cancel an unpaid booking, that cancellation is one more compensation, and it must be decided in advance (more on [steps that cannot be rolled back](../../fundamentals/consistency/#steps-that-cannot-be-rolled-back)). The status `held` acts as a semantic lock: other operations see that the units are promised and do not touch them.

::diagram{name="pay-steps"}

A payment can outlive its hold: the bank asks the guest to confirm in another app, and the guest comes back after the deadline. If the booking is still `held`, the confirmation passes, because its units are still counted for it. If it is already `expired`, its units are back in the count, and the confirmation in step 3 changes no rows. The site then moves the booking from `expired` to `confirmed` with a conditional update, and only if that update changes the row, takes the same units again on every night, in one transaction. The conditional move lets only one of two late callbacks take the units. If a night is full, another guest has the units: the transaction rolls back, the site cancels the authorization, and the first guest's money never moved. Some methods, such as bank transfers, have no separate capture: the money moves at once. For them, a late payment for a lost hold ends in a refund, or the site keeps the booking and handles a guest without a room, which is a business choice.

::diagram{name="late-payment"}

A hosted payment page has its own expiry, and it may be longer than the hold: a Stripe Checkout page can be set to run out no sooner than [30 minutes](https://docs.stripe.com/payments/checkout/managing-limited-inventory) after it opens. When the hold expires, the site closes the open page itself with the provider's [call to expire it](https://docs.stripe.com/api/checkout/sessions/expire), so the guest cannot start paying for units they no longer hold. A page the guest has already paid on cannot be closed, and its payment is handled as a late payment.

The provider's answer can get lost. A timeout does not mean the payment failed: the attempt stays pending while the site asks the provider for the state of the payment by its ID. A lost answer to the authorization comes before the decision: the hold stays, but only up to a set limit; past it, the site cancels the authorization, returns the units, and treats a success that arrives later as a late payment. A lost answer to the capture comes after the decision: the booking keeps its units while the site finds out whether the money moved.

::diagram{name="lost-answer"}

The provider also reports results through callbacks, which may come late, twice, or out of order. Keep the payment's state apart from the booking's: in one transaction, record each callback by its event ID on the payment attempt and make the booking move it calls for, if any, so a crash cannot record the callback without its effect. A success for an expired booking still needs an action: take the units again, or cancel the authorization. When neither the answers nor the callbacks settle a payment, compare the site's records with the provider's.

::diagram{name="callback-with-effect"}

:::do
Authorize, confirm the hold in the database, then capture right away. If the hold is lost by then, take the same units again if they are free, and cancel the authorization if they are not. Record the due capture in the transaction that confirms the booking. Close an open payment page when the hold expires, keep the hold of an unanswered authorization only up to a limit, and decide in advance what happens when a capture fails.
:::

## Holding in another service too

The site adds an airport transfer from a partner company to a booking. The guest wants both or neither: a room without a transfer does not help a guest who lands at night. The partner runs its own system, and no transaction spans both.

The same hold works in each system. With try, confirm, cancel, the booking first takes a hold in every system: a room in its own database, a car in the partner's. When all holds succeed, the payment runs, and the site records its decision to confirm. Then it confirms each hold, retrying until each one answers; when a hold fails before the decision, it cancels the others. Each system keeps the state of its own hold, so it can answer a confirm or a cancel after a restart. <!-- link: patterns/sagas -->

::diagram{name="tcc-steps"}

This works only if each partner promises to confirm a hold that has not run out. So the partner's hold must last longer than the site's hold plus the payment, and the site confirms it right after its own decision. A hold can still run out, for example while the partner's system is down. The booking then needs a path back that the business chose in advance: find another transfer, or cancel the room and refund.

::diagram{name="partner-hold-length"}

Holds in several systems do not deadlock the way locks in one database can: a hold either succeeds or fails at once, and nobody waits for another holder. A booking that cannot get every hold releases the ones it has and tells the guest.

Two orders of steps go wrong in practice. Releasing too early: when a confirmed booking is cancelled, the site must not return the room to sale while the transfer's cancellation can still fail and the guest may still come. Return the units after every other step of the cancellation is final. Arriving out of order: a cancel can reach the partner before the hold it cancels, for example after a retry. The partner then remembers the cancelled booking ID, so the late hold is refused instead of holding a car nobody will confirm.

::diagram{name="cancel-before-hold"}

A partner that offers no holds can only book outright, and that booking may fail when the partner has no cars left. Make it the step that may fail: book it before the site's own decision, and cancel it, at a fee the business accepts, if the rest of the booking fails.

:::do
Across systems, take a hold in each, record the decision, then confirm each hold, and cancel the rest when one fails before the decision. Require each hold to outlive the payment, plan a path back for a hold that still runs out, return units only after a cancellation is final, and remember cancelled IDs so a late hold is refused.
:::

## Showing availability

Guests search before they book: a city, dates, two adults. Each search asks which hotels have a room on every night of the stay, and guests make many searches for each booking. Reading the inventory rows for every search would load the database that takes the bookings.

Searches read a copy: a follower, a cache of counts per hotel, room type, and night, or a search index. A copy is behind by seconds or more, and that is fine for browsing. A late count shows a room that was just taken, or hides one that was just returned, but it breaks no booking, because only the take writes, and the take goes to the owner of the count, the inventory rows on the leader. Kleppmann calls this the difference between timeliness and integrity ([Kleppmann, Riccomini](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/)): a late copy catches up once the changes reach it, while a room sold twice stays wrong, so the check that protects the data must run where the data lives (more on [copies that are behind](../../fundamentals/replication/#reading-from-a-copy-that-is-behind)).

::diagram{name="availability-paths"}

The cost lands on the guest: they pick a room the search showed, and the take answers that it is gone. Count those answers, such as HTTP 409, as a share of all takes: a rising share means the copies fall too far behind, or the stock sells faster than they update. Where a stale count would mislead many guests, ask the owner directly: for a hotel with one or two rooms left, read the inventory rows before showing the price. For stock that sells out in minutes, a cache may save little, because its counts are wrong most of the time.

Copies learn about changes from the database: the app updates the cache after each commit, or a process reads the database's change stream and updates the copies. An update the app sends after a commit is lost if the app crashes in between, so prefer the change stream, or give cached counts a short TTL (more on [updating the cache when data changes](../../fundamentals/caching/#updating-the-cache-when-data-changes)). Holds, returns of expired holds, and cancellations change the count as much as bookings do, so every one of them must reach the copies. A seat map that people watch while others buy needs its changes pushed to the open pages. <!-- link: patterns/real-time -->

::diagram{name="missed-copy-update"}

:::do
Serve availability from copies, and take units only on the owner of the count, with the usual conditional update. Watch the share of takes that fail on a unit the copy showed as free, and read the owner directly when only a few units are left.
:::

## Selling more than you have

Hotel 12 is full on paper for a June night, but some guests never come. These are **no-shows**: guests who neither arrive nor cancel. Others cancel the day before, too late for anyone else to book. Each such room stays empty for the night, though someone else would have paid for it.

Hotels and airlines therefore sell more units than they have. This is **overbooking**. The count gets a limit above the total for each night, and the take checks the limit instead of the total:

```sql
UPDATE inventory
SET taken = taken + 1
WHERE hotel_id = 12
  AND room_type_id = 3
  AND night >= '2027-06-10'
  AND night < '2027-06-13'
  AND taken < sell_limit;
-- 3 rows
```

The `CHECK` that kept `taken` within `total` now keeps it within `sell_limit`. The limit starts at the total, and the hotel raises it for nights where it expects guests not to come. How far depends on how many guests usually do not come and on the cost of a guest who comes and finds no room. In two Portuguese hotels, 0.73% and 1.15% of all bookings for arrivals from 2015 to 2017 ended as no-shows ([António et al.](https://doi.org/10.1016/j.dib.2018.11.126)). In coach cabins of Air Canada flights from Toronto in May to July 2002, 9.95% of the passengers still booked when the reservations were read just before departure did not show up ([Lawrence et al.](https://dominoweb.draco.res.ibm.com/reports/RC22732.pdf)). Each business measures its own rate, per night or flight.

::diagram{name="sell-limit"}

An extra booking brings its revenue V when a room is left for it, and costs C, the price of turning a guest away, when the guests who come already fill every room. So accept one more booking while the chance P of that second case stays below V / (V + C). This comes from a simple model of one flight in which each passenger fails to show with the same chance ([LINDO](https://www.lindo.com/doc/online_help/lingo20_0/optimal_airline_overbooking_i.htm)). The higher C, the fewer extra bookings pay off. P comes from the whole spread of no-shows, not from their mean: two nights with the same mean no-show rate can need different limits when one of them varies more ([Gallego, van Ryzin](https://business.columbia.edu/sites/default/files-efs/pubfiles/3942/multiproduct_dynamic.pdf)).

::diagram{name="overbooking-threshold"}

When everyone comes, the business keeps its promise another way. A hotel walks the guest: it books a comparable hotel nearby, pays for the transport and the first night, and lets the guest call home, as [IHG guarantees](https://www.ihg.com/content/us/en/customer-care/book-with-confidence) for online bookings secured with a credit card. Airlines first ask for volunteers, and passengers denied boarding against their will are paid an amount set by law: on flights the EU rule covers, €250, €400, or €600 by distance and route, which the airline may halve when the new flight it offers arrives only a little late ([EU](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32004R0261)). In 2025, the airlines that report to the US Department of Transportation denied boarding against their will to 0.28 of every 10,000 passengers ([US DOT](https://www.transportation.gov/sites/dot.gov/files/2026-03/February%20%202026%20ATCR.pdf)).

Overbooking fits units that can be swapped for a near equivalent, where the cost of a broken promise is known and bounded. It does not fit an apartment that is the only one of its kind, whose guest has nowhere comparable to go, or a numbered seat that the buyer chose. Helland describes some business promises as [kept by apology](https://web.archive.org/web/20090601165544/http://blogs.msdn.com/pathelland/archive/2007/05/15/memories-guesses-and-apologies.aspx): even exact records cannot stop a room from flooding the night before arrival, so a business needs a way to make up for a broken promise anyway. Overbooking uses that way on purpose.

:::tradeoff
Overbooking fills units that no-shows would leave empty, at the cost of compensating the buyers who find no unit. It needs a cost per broken promise that the business accepts, and units that a near equivalent can replace.
:::

## Selling a unit everyone wants

The site runs a promotion: at 10:00, 100 double rooms in hotel 12 go on sale for one euro a night on a June weekend. Thousands of guests press "Book" in the same second, and every take writes the same two inventory rows, one per night. Each take waits for the lock of the one before it, so the takes run one at a time: the counts have become [hot rows](../../fundamentals/transactions/#contention-on-one-row). Escrow already keeps each lock short, but a single row still admits one writer at a time.

Three ways split the count:

- Buckets. Keep the 100 rooms of each night as ten rows of ten. A take picks a row at random and tries the next when that row is empty. Ten takes can run at once, and the night is sold out only when all rows are empty. A stay of several nights takes one bucket per night, in date order, all or none. Buckets add few rows, but near the end most of them are empty, and takes spend tries on finding the last rooms.
- A pool of unit rows. Keep a row per unit and let each take claim any free ones with `SKIP LOCKED`, so takes do not wait for each other. A take that gets fewer rows than it needs rolls back: others may hold the rest for a moment. This costs a row per unit and a job that keeps the pool filled. Shopify keeps such a pool of at most 1,000 rows per item and location and refills it from the stock count; when a sale empties it, one transaction refills it under a lock while the other takes wait ([Shopify](https://shopify.engineering/scaling-inventory-reservations)).
- Quotas. Give each server or region a **quota**, a share of the units it may sell without asking the others. Takes need no shared row at all, and a region keeps selling when the link to the others breaks. The cost is stranded units: one region declines guests while another still has rooms. Helland and Campbell show it with 1,000 books split as 500 per copy: one copy can run out while the other keeps its 500 ([Helland, Campbell](https://www.cidrdb.org/cidr2009/Paper_133.pdf)). Moving unused quota needs a handoff the old owner records first: it gives the units up, and only then does the other side get them. A region that cannot be reached keeps its quota until it answers.

::diagram{name="split-count"}

::diagram{name="quota-handoff"}

Start with buckets, which change the least. Move to unit rows when takes still wait for each other, and to quotas only when regions must sell without asking each other.

A counter in memory in front of the database turns most guests away once the rooms are gone. Each take first decrements a counter in Redis, with a short script that decrements only while the counter is above zero, and a guest it refuses is told the rooms are sold out without reaching the database. When the take then fails in the database, it adds its unit back. The database stays the owner: the counter only filters, and the take in the database still checks its own count. The counter is approximate. A wrong "yes" costs a wasted take that the database refuses; a wrong "no" leaves a room unsold. When a hold expires and the database gets units back, add them to the counter too, and repair it from the database in a way that does not overwrite newer decrements. If Redis fails, the whole rush reaches the database, so the protection in front of the sale must still hold. Keep the holds themselves in the database that confirms the booking. In a 2026 post, Shopify described moving its holds from Redis back into MySQL: the step that turned a hold into a sale had to change both systems, and without one transaction across them it could sell a unit twice or leave it unsold ([Shopify](https://shopify.engineering/scaling-inventory-reservations)).

::diagram{name="counter-filter"}

Every count needs one owner. Keep all rows of one hotel on one shard, so a stay of several nights takes its rows in one transaction (more on [choosing the shard key](../../fundamentals/sharding/#choosing-the-shard-key)).

:::do
For a count that many takes hit at once, split it into buckets or unit rows that takes claim independently, and keep a counter in memory only as a filter in front of the database. Use quotas only when servers or regions must sell without asking each other, and move a quota only after its old owner has given it up.
:::

## Letting buyers in at a pace

Even with a split count, 100,000 people open the promotion at 10:00 for 100 rooms. The pages, the search, and the payments must serve them all, and most will leave with nothing. A **waiting room** stands in front of the sale and lets buyers in at a pace the system can serve.

A waiting room has two limits: how many buyers may be inside at once, and how many new buyers it lets in per minute. A buyer counts as inside until a set time passes without a request. Set the first limit below what the system can take: Cloudflare advises [75% of the capacity](https://developers.cloudflare.com/waiting-room/reference/best-practices/) of the servers behind it. A buyer let in gets a signed token, and every request of the booking checks it on the server; a redirect alone can be skipped by calling the booking API directly. In a queue that lets people in by order of arrival, the waiting page estimates the wait as the number of people ahead divided by the number let in per minute ([Cloudflare](https://developers.cloudflare.com/waiting-room/reference/waiting-room-cookie/)).

::diagram{name="waiting-room"}

The order in the queue decides who gets to shop first. First in, first out rewards whoever arrives first, which favors bots that open the page at the exact second. For a sale that opens at a set time, a random order among everyone who came before the opening removes that edge: Queue-it collects early buyers before the sale, shuffles them at the opening, and puts later arrivals at the end in order of arrival ([Queue-it](https://queue-it.com/product/scheduled)). A lottery among people who registered days before, as Ticketmaster ran [for a 2023 tour](https://blog.ticketmaster.com/pearl-jam-tour-2023/), also leaves time to screen out bots.

::diagram{name="fifo-vs-shuffle"}

Being let in does not promise a room. Say so on the waiting page, and keep the time a let-in buyer may shop limited. When no units are free, stop letting people in, and start again when expired or failed holds return units; close the queue only when the sale ends. One person with many accounts gets many places in the queue, so limit purchases per person, not per account: Ticketmaster links orders by name, address, and payment card to [enforce its ticket limits](https://help.ticketmaster.com/hc/en-us/articles/9781245025937-Why-is-there-a-ticket-limit). A limit on requests per client is a different tool: it protects the servers from one client, while a waiting room shares a fixed capacity among all of them. <!-- link: patterns/rate-limiting -->

:::do
Put a waiting room in front of a sale that draws far more buyers than the system can serve. Limit buyers inside and new buyers per minute below capacity, and check the admission token on the server. For a sale that opens at a set time, shuffle the buyers who came before the opening. Pause admission while no units are free, and close the queue only when the sale ends.
:::

:::explain
When asked to design a flash sale, separate three problems: a count that every take writes, a load that the whole site cannot serve, and fairness among buyers. Give each its own fix, and keep the database as the owner of the count.
:::

## Offering to one person at a time

Some apartments take requests to book: the guest asks, and the host has a day to accept, while the dates stay blocked for that guest. When a booking is cancelled on a sold-out weekend, the freed room goes to the guests on a waitlist. A ride-hailing service offers each ride to one driver for a few seconds. In each case, the system waits for one chosen person's answer.

An **offer with a deadline** is a hold that waits for a person's answer: the unit is held for one party, one person is asked, and the offer ends with an acceptance, a refusal, or the deadline. The offer gets the same statuses as a hold, from `offered` to `accepted`, `declined`, or `expired`, and every move is a conditional update from `offered`. Unlike a booking hold, an offer checks its deadline on acceptance, which is again a business choice: once the deadline passes, the next person may already be asked. So an acceptance passes only while the offer is `offered` and its deadline is in the future, and the expiry passes only while it is `offered` and the deadline has passed. A late acceptance changes nothing, and the person learns they were too late.

::diagram{name="offer-states"}

A ride adds a second rule: a driver gets one open offer at a time, so the driver needs a hold too. The offer takes both, all or nothing, for example in one transaction where the ride's and the driver's records live together; an acceptance turns the driver's hold into a trip, and a refusal or an expiry releases it.

::diagram{name="ride-offer"}

The deadline must survive a restart of the server that made the offer. Store it with the offer, and schedule a delayed message, or a timer in a workflow engine that keeps its state in a database, to fire at the deadline. When it fires, the handler runs the conditional expiry for that offer's ID, so an old timer cannot end a newer offer. If the update changes nothing, the offer has already ended, by an answer or an earlier run, and the handler stops. Otherwise, in the same transaction, it creates the next offer, or a record that the next offer is due, so a crash between the two steps cannot stall the line. A sweeper over offers past their deadline catches the timers that were lost. <!-- link: patterns/job-scheduling -->

::diagram{name="offer-chain"}

What an expired offer returns is a business choice. A waitlist offer that runs out goes to the next guest. When a host does not answer a request, Airbnb keeps the dates [blocked](https://www.airbnb.com/help/article/3612) until the host opens them again, so a silent host does not get a booking by default. A cancelled booking returns its units like an expired hold, and on a waitlist it starts the next offer.

Offering to one person at a time is slow when many people do not answer: each silence costs a full deadline. Offering the same unit to several people at once is faster, but then it is no longer an offer: the first to accept takes the unit with an ordinary conditional update, and the others learn it is gone. Pick one person at a time when the order of the line matters, such as a waitlist, or when a lost race costs the person a lot, such as a driver who turns the car around for a ride that another driver took. <!-- link: systems/ride-hailing -->

::diagram{name="one-vs-many"}

:::do
Treat an offer as a hold with a deadline on the unit, and on the person when they may get only one offer at a time. Keep the deadline in the data with a timer that survives restarts. Check the deadline in the acceptance and in the expiry, act on a timer only when its conditional update wins and record the next step in the same transaction, and decide in advance what an expired offer returns.
:::

:::explain
When asked how a ride reaches one driver, name both rules: a ride is offered to one driver at a time, and a driver has at most one open offer. Then say what happens on a refusal, on silence, and on an acceptance that comes after the deadline.
:::

## Cheat sheet

- When buyers do not care which unit they get, keep a count per unit type and period, and take every period of a request in one transaction with an atomic update that checks the count. Hand out the concrete unit late.
- An overlap check on an empty result locks nothing. For one unit booked by time range, use an exclusion constraint where the database has one, lock the unit's own row, or keep one row per unit and period when time comes in fixed steps.
- A hold of a quantity is its own record, and its units leave the shared count in the same transaction (escrow). Every status change is a conditional update from the status it leaves, the client creates the hold's ID, and active holds per account are capped.
- The human step sets a hold's length: minutes for a checkout, a day for a host, seconds for a driver. The server's expiry is the only truth; the app counts down the remaining seconds from when it asked, and the hold is extended once, when the payment starts, with a check of the holder.
- An expired hold of a count or under an exclusion constraint keeps its units until someone writes the expiry. Return them with a sweeper over an index on the expiry, in short batches, or on the take's path where it can find the holds that block it; a timer per hold only makes it faster. The expiry update checks the stored expiry, so an extended hold survives an old timer.
- Authorize, confirm the hold in the database and record the due capture in the same transaction, then capture. If the hold has expired, move it back with a conditional update and take the same units again if free; otherwise cancel the authorization. Close an open payment page with the hold, keep the hold of an unanswered authorization only up to a limit, and decide what a failed capture means.
- Across systems, hold in each, record the decision, then confirm each hold. Each hold must outlive the payment, a hold that still runs out needs a path back chosen in advance, and units return only after a cancellation is final.
- Serve availability from copies that catch up after missed updates, through a change stream or a short TTL, and take only on the owner of the count. Watch the share of takes that fail on a unit the copy showed, and read the owner when few units are left.
- Overbooking sells above the total where no-shows leave units empty and a broken promise has a known, bounded cost. The limit depends on the spread of no-shows and on that cost; it does not fit a unique unit or a chosen seat.
- A count that every take writes runs takes one at a time. Split it into buckets, then unit rows, or give quotas to regions that must sell alone and move a quota only after its owner gives it up. A counter in memory only filters in front of the database.
- A waiting room lets buyers in at a pace below capacity, with limits on buyers inside and new buyers per minute and a token checked on the server. Shuffle the early buyers of a sale that opens at a set time, pause admission while no units are free, and remember that admission does not promise a unit.
- An offer is a hold with a deadline that waits for one person, and on the person too when they may get one offer at a time. The acceptance and the expiry both check the deadline, a timer acts only when its update wins and records the next step in the same transaction, and the business decides what an expired offer returns.

## Sources

- Jayanth Kumar, Mandeep Singh. [System Design on AWS](https://www.oreilly.com/library/view/system-design-on/9781098146887/). O'Reilly, 2025. Chapter 18.
- Rylan Liu. [System Design Interview Fundamentals](https://payhip.com/b/2oudb). Independently published, 2021. "Concurrency Control and Transaction".
- Chris Richardson. [Microservices Patterns](https://www.manning.com/books/microservices-patterns). Manning, 2018. Chapter 4.
- Zhiyong Tan. [Acing the System Design Interview](https://www.manning.com/books/acing-the-system-design-interview). Manning, 2024. Chapters 5 and 15.
- Alex Xu, Sahn Lam. [System Design Interview: An Insider's Guide, Volume 2](https://www.amazon.com/dp/1736049119). ByteByteGo, 2022. Chapter 7.
- Pat Helland. [Life beyond Distributed Transactions: an Apostate's Opinion](https://www.cidrdb.org/cidr2007/papers/cidr07p15.pdf). CIDR, 2007.
- Pat Helland, Dave Campbell. [Building on Quicksand](https://www.cidrdb.org/cidr2009/Paper_133.pdf). CIDR, 2009.
- Emilie Noel. [We replaced Redis with MySQL for inventory reservations, and it scaled](https://shopify.engineering/scaling-inventory-reservations). Shopify Engineering, 2026.
- Patrick E. O'Neil. [The Escrow Transactional Method](https://doi.org/10.1145/7239.7265). ACM Transactions on Database Systems, 1986.
