# KAIRO Last Known Good

An LKG pointer identifies the most recent candidate that passed quality validation for `(dataset, entityKey)`. Promotion occurs in the same database transaction as snapshot and quality-record creation.

Read order is: fresh normalized data, fresh published snapshot, stale LKG with a visible stale status, then explicit unavailable state. Mock data is never inserted into this chain.

Calendar and Political use persisted records first. Global Risk can reuse an individual prior component only when the current component is missing; it marks it `STALE LKG`, caps completeness and lowers confidence. A dataset outage therefore cannot create a false zero, false green regime, or false “no political activity” claim.
