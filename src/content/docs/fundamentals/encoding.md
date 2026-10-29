---
title: Encoding
description: How to preserve values when data crosses programs, from its byte representation to schemas, compatibility, and changes over time.
---

Every network exchange and stored record needs bytes that another program can read, often after the code has changed. Choose a representation that preserves the values, then plan which reader and writer versions must keep working together.

## Preserving values across programs

An order service sends order 501 to a browser. In the server's memory, the order has a decimal amount, a creation time, and a status. These values live in objects whose memory addresses mean nothing to the browser. The server needs a representation the browser can read.

**Encoding**, also called serialization, turns values into bytes for storage or transmission. **Decoding** turns those bytes back into values the receiving program can use. A format tied to one language's objects couples the data to that runtime and its classes. Some object decoders can also run code while reconstructing objects, so they are unsafe for untrusted input. Use a format that the programs on both sides can read. <!-- link: fundamentals/security -->

**JSON** is a text format for records and nested values, supported by many languages. Encode its text as UTF-8 for exchange between systems. The service can send:

```json
{
  "id": "501",
  "amount_minor": 1990,
  "currency": "USD",
  "status": "created",
  "created_at": "2026-10-29T12:30:00Z"
}
```

The JSON number `1990` carries no currency or unit. Both programs must agree that `amount_minor` counts cents for USD, so the value means $19.90. JSON also leaves numeric precision to the implementation. Sending `19.90` as a number can turn an exact decimal amount into an approximation when a reader uses binary floating point. For amounts with a fixed scale, send integer minor units and a currency. For decimal values with a varying scale, a decimal string such as `"19.90"` can preserve the value, provided the reader uses decimal arithmetic. Agree on the scale and rounding rules, and keep integers within the range every reader supports. Large IDs have [the same cross-language precision problem](../../patterns/unique-ids/#ids-ordered-by-creation-time).

::diagram{name="encoding-value-boundary"}

A creation time needs a representation too: JSON has no date or time type. A string with [an explicit UTC offset](https://www.rfc-editor.org/rfc/rfc3339.html#section-5.6) identifies an instant; `Z` in the example means UTC. If a contract uses a number instead, specify its origin and whether it counts seconds, milliseconds, or another unit. A time with no offset leaves the reader to guess which instant it means.

::diagram{name="encoding-time-offset"}

Arbitrary bytes also need a convention. JSON strings hold text, so use Base64 when a small binary value must travel inside JSON. It represents bytes as text and increases their size. For large files, send a reference and transfer the file separately. <!-- link: patterns/large-files -->

::diagram{name="encoding-bytes-reference"}

:::do
At each boundary, agree on the representation, units, and supported ranges of the values. Pick types the receiver can use without losing the precision the operation requires.
:::

The reader also needs to know which fields to expect and what they mean.

## Knowing what the bytes mean

The order service returns the record to a browser and saves it for later processing. Each reader needs to know that the amount is an integer, the currency is a string, and the creation time follows an agreed format. This schema exists even if it is only written into the code that reads the record.

JSON carries field names and distinguishes strings from numbers, but parsing only checks that the text is valid JSON. **JSON Schema** describes rules a validator can check, such as field types and required properties. It can reject `"amount_minor": "1990"` when the field must be an integer. The programs still need to agree on what that integer measures. JSON works well at browser and external boundaries because it is widely supported and can be inspected as text. Field names travel with every record, and keeping code and a separate schema description in agreement takes work.

::diagram{name="encoding-parse-validate"}

**Protocol Buffers**, usually called Protobuf, is a format whose schemas give fields stable numbers and types. A definition for the same record is:

```proto
syntax = "proto3";

message Order {
  string id = 1;
  int64 amount_minor = 2;
  string currency = 3;
  string status = 4;
  string created_at = 5;
}
```

In the binary encoding, field numbers identify values instead of names. A reader uses the schema to map each number to a field and type. It does not need field declarations attached to each message. Code generated from the schema gives typed access to fields. A program can also read messages using a schema description loaded at runtime.

::diagram{name="encoding-protobuf-schema"}

This fits service boundaries where the teams can share schema definitions and generated code. The cost is schema distribution and tooling, and a binary message is harder to inspect without them. Types alone do not enforce every rule: `int64` does not specify a currency or rule out a negative amount.

**Avro** is a format that uses the schema under which data was written to interpret its binary values. This **writer's schema** for the same record is:

```json
{
  "type": "record",
  "name": "Order",
  "fields": [
    { "name": "id", "type": "string" },
    { "name": "amount_minor", "type": "long" },
    { "name": "currency", "type": "string" },
    { "name": "status", "type": "string" },
    { "name": "created_at", "type": "string" }
  ]
}
```

An Avro binary record stores its field values in schema order, without field names or numbers. The reader therefore needs the writer's schema.

::diagram{name="encoding-field-identity"}

A file can include it once for many records. Individual records can instead carry an identifier that a **schema registry** uses to find the stored schema. This saves repeating the schema, but makes its availability part of reading the data.

::diagram{name="encoding-schema-lookup"}

Avro fits exports and data pipelines where schemas can be generated from table definitions and readers can get them alongside the data. Code generation is optional. Regenerating a Protobuf export schema requires keeping each field's assigned number across table changes. An Avro export can carry the generated writer's schema. A binary format may also be justified by a measured size or CPU need. Compare the same data with the compression and readers the system will actually use.

:::do
Use JSON at browser and external boundaries when broad support and readable data matter. Pick Protobuf for service contracts with shared schemas and tooling, or Avro for generated exports where readers can get the writer's schema. Use measured costs to judge size and CPU needs.
:::

## Reading data from another version

The service adds a delivery note to order 501. New instances write `"delivery_note": "Leave at reception"`, while old instances and clients still use the previous fields. Some new instances also read orders saved before the field existed. Choosing the same encoding format does not make all these combinations work.

The program that encodes the record is its writer, and the program that decodes it is its reader. **Backward compatibility** means a new reader can read data from an old writer. **Forward compatibility** means an old reader can read data from a new writer. Check each direction separately:

| Writer | Reader | What must work |
| --- | --- | --- |
| Old | Old | The original record |
| Old | New | The new reader handles a missing delivery note: backward compatibility |
| New | Old | The old reader accepts the added field: forward compatibility |
| New | New | The record with the delivery note |

::diagram{name="encoding-shared-record-versions"}

For backward compatibility, the new reader needs a meaning for absence. Here it means no delivery instruction was supplied. A reader that rejects records without the field cannot read the old data. An absent field and a field whose value is `null` are different: allowing `null` does not by itself allow absence. Pick the representation that the format supports and make the application handle it.

In JSON, an old reader can tolerate the addition if its validation and field mapping accept properties it does not know. An old schema with `additionalProperties: false` rejects the new record. A new schema must also accept old records with no note. A JSON Schema `default` is an annotation; validation does not insert a missing value. The application must apply any fallback it needs. If an old open schema already allowed the new property name with other types, constraining its type can also reject old data. Optional alone is not a guarantee of compatibility.

::diagram{name="encoding-json-evolution"}

For binary Protobuf, add a field with a new number:

```proto
optional string delivery_note = 6;
```

Old readers can skip this field. New readers can check whether it was supplied, including the difference between absence and an explicitly supplied empty string. The `optional` label gives that presence information for a proto3 string. The binary rules do not automatically apply to the JSON mapping: names and handling of extra fields matter there too.

::diagram{name="encoding-field-presence"}

Avro uses the writer's schema together with a **reader's schema**, which describes the fields the reading program expects. **Schema resolution** matches record fields by name and maps them into the expected shape. It ignores a writer field absent from the reader's schema. For a field present only in the reader's schema, it uses that schema's default or fails if no default exists. The new reader can declare:

```json
{
  "name": "delivery_note",
  "type": ["null", "string"],
  "default": null
}
```

This default lets the new reader read an old record. It does not let the new writer omit the field: the writer still encodes a value, which may be `null`. An old reader uses the new writer's schema to find the fields it knows and skip the note. It still needs access to that writer's schema.

::diagram{name="encoding-avro-resolution"}

:::distinguish
API guides often call a change backward compatible when old clients keep working with a new server. For requests, the new server is a new reader of old data. For responses, the old client is an old reader of new data. The API promise therefore combines backward compatibility for requests with forward compatibility for responses.
:::

::diagram{name="encoding-api-directions"}

The combinations in use decide the update order. If only backward compatibility is guaranteed, update the readers before new writers produce records that old readers cannot handle. If only forward compatibility is guaranteed, update writers first; new readers must not encounter retained old records they cannot read. When both directions hold, either order can work at the format level. Requests and responses can require different directions.

During a rolling update, old and new service instances may both read and write shared records. Each version must be able to read the records the others actually write. Both reading directions must hold for the shapes written while those versions coexist.

When a change needs new reading logic, separate preparing readers from enabling the new writes. A preparation release reads both shapes but keeps writing the old one; a later release enables the new shape. Rolling back that later release is safe only if the version restored can read everything already written. A version from before that preparation cannot read the new records. <!-- link: practices/releases -->

::diagram{name="encoding-prepare-enable"}

:::do
For an added field, define what absence means and check that old readers accept it. If new writes need new reading logic, release that logic before enabling those writes.
:::

An old reader may accept the new record and still lose its added field when writing it back.

## Keeping fields the reader does not know

An old service instance reads order 501, changes its status to `confirmed`, and replaces the stored record. Its model has no delivery note. If it builds the replacement from the fields it knows, `delivery_note` disappears. Both operations succeed, but the instruction is lost.

**Unknown fields** are fields present in the data but absent from the reader's schema or model. A reader that will write data back needs to preserve them through decoding, changes in memory, and encoding. Accepting them at the parser is only the first step.

If the store supports updating individual fields, change only the fields the operation owns. Updating `status` leaves the stored note alone. A full replacement instead needs a representation that retains unfamiliar fields, such as a JSON object that the program edits without rebuilding it from a fixed model.

Keeping the original bytes is not enough when the record must change. The program must combine its changes with the fields it needs to keep. Choose a targeted update when it expresses the operation; use full replacement when the operation owns the complete record and can preserve its remaining contents.

::diagram{name="encoding-rewrite-preservation"}

Binary Protobuf messages [retain unknown fields when parsed and serialized](https://protobuf.dev/programming-guides/proto3/#unknowns). Modifying the parsed message or using a whole-message copy can keep the note even in old code. Copying known fields into a fresh message or converting through JSON loses this protection. Check the actual library and conversion path, including intermediate application models.

::diagram{name="encoding-protobuf-roundtrip"}

An Avro reader schema that omits the note produces a resolved record without it. Writing only that record under the old schema cannot restore the discarded value. To replace the complete record, a program can read it using the writer's schema, keep all its fields, and encode its changes under a schema that includes them.

The tools must be able to use that schema at runtime. Otherwise, update only the fields the operation owns, or send the operation to a writer that understands the complete record.

::diagram{name="encoding-avro-rewrite"}

Forwarding a message through an older program has the same risk if the program decodes and rebuilds it before sending it on.

:::do
Check the oldest supported writing path: add an unfamiliar field, change a known field, write the record back, and read it with the new schema. Verify that both values survive through the real transformation path.
:::

## Changing fields without changing their meaning

The team considers renaming `delivery_note` to `delivery_instructions`. It may also introduce new statuses or change how an amount is represented. Each change can affect the encoded data, the code that uses it, and the operation's result.

**Wire compatibility** means the supported programs can exchange encoded values correctly. **Source compatibility** means existing code still compiles and works with updated generated code or libraries. **Semantic compatibility** means the values and behavior keep the meaning callers rely on. A field rename in binary Protobuf can keep its encoded identity while breaking code that uses the old generated field name. Changing cents to dollars can keep the type while changing the amount.

::diagram{name="encoding-compatibility-levels"}

Field identity decides what a rename does. In JSON, a new property name gives an old reader no way to find the value under the old one. In binary Protobuf, keeping the field number and type preserves the encoded identity, but generated names change. Its JSON mapping, **ProtoJSON**, uses field names, so the binary guarantee does not cover that path. Since Avro matches fields by name, a new reader can use [an alias for the old name](https://avro.apache.org/docs/1.12.0/specification/#aliases) if its implementation supports aliases. An unchanged old reader does not learn the new name from that alias. Check both reading directions before renaming in place.

::diagram{name="encoding-rename-directions"}

Before new writers stop including a field, check that supported readers, validators, and application rules accept its absence. An Avro reader may need a default; a JSON validator may still require the property; an application may rely on a value that the decoder merely replaces with a default. In Protobuf, [reserve a removed field's number and name](https://protobuf.dev/best-practices/dos-donts/#do-reserve-tag-numbers-for-deleted-fields). Reusing the number can make historical bytes appear to be a different field.

::diagram{name="encoding-reserved-identity"}

A wider type does not immediately permit a wider range. With binary Protobuf, changing `int32` to `int64` can let both versions parse a message, yet an old reader truncates values outside its range. Keep writes within the old range until every reader that may receive them supports the larger values. When reader upgrades cannot be controlled, prefer a separate field. Changing a unit needs a separate representation too: interpreting `1990` as dollars instead of cents silently changes the value even when every parser accepts it.

::diagram{name="encoding-integer-range"}

Making the note mandatory rejects old records and requests that omit it. Enforce the new requirement only where all supported writers can meet it, or keep a fallback that preserves the old behavior. Do not replace absence with an empty string or zero unless they mean the same thing.

For partial updates, define whether absence means leave unchanged and how to request clearing a value. Protobuf's [presence rules](https://protobuf.dev/programming-guides/field_presence/#merging) matter here: a merge with implicit presence skips default-valued scalar fields, so it cannot express every clear or set-to-zero operation without a separate update mechanism.

::diagram{name="encoding-zero-merge"}

An **enum** names a set of allowed values. The order's status is currently a string, but a validator or application switch may still assume a fixed set such as `created` and `confirmed`. Adding `cancelled` needs a defined response from older code. It must not silently treat an unfamiliar status as a known one.

Protobuf's [open enums retain unfamiliar numeric values](https://protobuf.dev/programming-guides/enum/#definitions). With a closed enum, the program sees the default value, and the unfamiliar number stays among unknown fields. Library behavior also varies. Avro [uses a reader enum default for an unfamiliar symbol](https://avro.apache.org/docs/1.12.0/specification/#schema-resolution), or fails without one. In either format, choose an appropriate fallback or reject processing until a capable reader handles the record.

Rebuilding generated code can also break an exhaustive switch that has no branch for a new value.

::diagram{name="encoding-unknown-status"}

:::do
Preserve field identities and meanings. Prefer an added field when a rename, type change, or new interpretation cannot satisfy the required readers. For each change, check the encoded values, generated code, and application behavior separately.
:::

An additive replacement lets readers support both fields before writers switch. Define which value wins if both appear, and keep them consistent while old readers remain. **Expand and contract** adds the new representation first and removes the old one only after its users and data no longer need it. This requires temporary translation and support for both shapes. <!-- link: patterns/data-migration -->

For the order service, a clearer name alone does not justify keeping two fields in sync. It keeps `delivery_note` as a string.

## Keeping old formats readable

All running instances of the order service can now read and write `delivery_note`. Orders saved before the note existed still lack it, and a browser with old code may still send requests. A reporting consumer may also read retained order events from before the change. <!-- link: fundamentals/messaging -->

Work out which writer and reader versions can meet at each boundary. Their lifetimes differ:

| Boundary | Combinations that may still be needed |
| --- | --- |
| Stored records | Current readers with every stored shape still needed, including data restored from backups |
| Client and service | Supported clients and servers in both request and response directions, even when they update independently |
| Retained messages | Supported consumers with current messages and every historical shape they may read again |

If an earlier release may be restored, its readers and writers count too. Finishing the current deployment therefore does not by itself end support for an older shape. Keep the decoding logic and any writer schemas needed to read data for as long as that data can return to a supported reader. A schema identifier is useful only while readers can still get its schema.

::diagram{name="encoding-version-lifetimes"}

Checking only the previous schema can miss a required combination. Suppose Avro v1 has no delivery note. A v2 reader adds it with a default, so it can read v1. A v3 reader removes the default: it can read v2 records, whose writers encode the note, but fails on v1 records without it. Both adjacent backward checks pass while the newest reader cannot read the oldest data.

::diagram{name="encoding-history-checks"}

**Transitive compatibility checking** compares a proposed schema with every earlier schema in the configured history, in the selected reading direction. For example, Confluent Schema Registry's [`BACKWARD_TRANSITIVE` checks the new reader against all earlier writer schemas](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html#backward-compatibility); `BACKWARD`, its default mode, checks against the previous one. Forward checks reverse the direction, and full checks cover both. Choose the scope and direction from the combinations the system must support. A registry's approval covers its schema rules and configured history. Exercise the required combinations through actual programs to check application behavior and data preservation too. <!-- link: practices/testing -->

To stop reading an old format, check every place its data can remain. Keeping an old decoder avoids rewriting data, but adds code and test cases to maintain. A program can write a record back in the new shape when it reads or updates it. This spreads conversion work over normal traffic, but keeps the conversion code in use and leaves untouched records in the old shape.

A separate rewrite of the dataset can convert those records, at the cost of reading and writing them. It must handle writes that continue during the conversion. <!-- link: patterns/data-migration -->

::diagram{name="encoding-lazy-rewrite"}

Rewriting the live store does not convert a backup or a retained message. Either keep a path for reading and converting such copies when restored, convert the copies too where appropriate, or wait until they are no longer part of the supported data. Stopping old clients or consumers also needs an explicit end to their supported contract; a quiet period alone does not prove that none can return.

::diagram{name="encoding-restored-data"}

:::do
Remove support for a shape only when no supported reader can encounter it and no supported writer can produce it again. Include retained data, restore paths, independently updated clients, and releases that may return.
:::

## Introducing an incompatible contract

The order service wants to replace the string `delivery_note` with a list of instructions. An old client expecting a string cannot use an array under the same name. Adding `delivery_steps` as a new list field while continuing to return `delivery_note` as a string may preserve the existing contract. Prefer this when both representations can keep their promised meaning; it avoids requiring clients to switch contracts together.

When the change needs a separate contract, **contract versioning** gives callers a way to select the shape and behavior they support. An API can identify that choice in the request. <!-- link: technologies/api-styles --> Stored records and messages need enough information alongside the payload to select the correct reading path. The selection may use a schema identifier when it supplies everything the reader needs. A version label alone does not convert an array to a string or implement the old behavior.

::diagram{name="encoding-version-selection"}

Supporting two contracts requires implementations for both. One option keeps separate handling paths. It can keep different behaviors for each contract, but fixes and tests may need to cover both paths. Another uses an **adapter**, a translation between a supported contract and the program's current model. This can keep representation differences near the boundary, but each translation must preserve what that contract promises. An API model, a stored record, and a retained event can use different schemas; sharing one model couples their changes.

::diagram{name="encoding-contract-handlers"}

For the instruction change, an adapter could turn an old string into a one-item list. Returning a list to an old client needs a separate decision: joining its items into text loses the structure. That can serve a contract that promises plain text if the result preserves its meaning. If the old contract cannot express a required difference, no translation can preserve it. Keep the old behavior for those clients, restrict which new values reach them, or require a move to the new contract before they use the feature.

::diagram{name="encoding-translation-loss"}

In 2017, [Stripe described version-change modules that transformed current responses into older API shapes, while changes with side effects needed version-dependent behavior elsewhere](https://stripe.com/blog/api-versioning). Supporting old contracts costs more when they require different operations or effects, since translating a response cannot preserve those behaviors by itself.

:::tradeoff
Parallel contracts let clients upgrade independently. Each supported contract adds translation or handling code and behavior checks. It also needs a plan for ending support. Introduce one when compatible additions cannot meet the required behavior, and define how its users and retained data will eventually leave it.
:::

::mark-as-read

## Cheat sheet

- Agree on types, units, precision, ranges, and time representations. For exact decimals, use integer minor units at a fixed scale or decimal strings with decimal arithmetic.
- Use JSON at browser and external boundaries, Protobuf for service contracts with stable field numbers and shared schema tooling, and Avro for exports and pipelines with writer schemas available to readers. Measure size and CPU costs with the actual workload.
- Backward compatibility lets new readers read old data; forward compatibility lets old readers read new data. Check absence and defaults, then order updates so every reader can handle the data it may receive, including after restoring an earlier release. When new reading logic is needed, ship it in a release that still writes the old shape.
- A reader that rewrites or forwards data must preserve unfamiliar fields it is expected to keep. Update only owned fields where possible, or retain those fields through the complete transformation path.
- Check changes at the wire, source, and semantic levels. Preserve field identities and meanings; prefer additive replacements when in-place changes cannot meet the required contracts.
- Keep decoders and required schemas while old data or writers can return. Check every relevant historical version, and account for untouched records, retained messages, and restore copies before removing support.
- Prefer compatible additions when they preserve the required behavior. A separate contract needs handling or translation that keeps its promised behavior, support for its users, and a plan for retirement; a version label performs no conversion.

## Sources

- Martin Kleppmann, Chris Riccomini. [Designing Data-Intensive Applications](https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/), 2nd edition. O'Reilly, 2026. Chapter 5.
- Apache Software Foundation. [Apache Avro Specification, version 1.12.0](https://avro.apache.org/docs/1.12.0/specification/). Apache Avro, 2024.
- Tim Bray (editor). [The JavaScript Object Notation (JSON) Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259.html). IETF, RFC 8259, 2017.
- Andy Coates. [Evolving JSON Schemas — Part I](https://www.creekservice.org/articles/2024/01/08/json-schema-evolution-part-1.html). Creek Service, 2024.
- Google. [AIP-180: Backwards compatibility](https://google.aip.dev/180). API Improvement Proposals, 2019, with later updates.
- JSON Schema. [Object](https://json-schema.org/understanding-json-schema/reference/object) and [Annotations](https://json-schema.org/understanding-json-schema/reference/annotations). Understanding JSON Schema.
- Sandeep Pokkunuri. [Ensuring rollback safety during deployments](https://aws.amazon.com/builders-library/ensuring-rollback-safety-during-deployments/). Amazon Builders' Library, 2019.
- Protocol Buffers. [Language Guide (proto 3)](https://protobuf.dev/programming-guides/proto3/). Protocol Buffers Documentation.

::mark-as-read
