---
layout: home

hero:
  name: Mongoat
  tagline: A lightweight, fast, type-safe MongoDB ODM for Node.js/TypeScript
  actions:
    - theme: brand
      text: Get started
      link: /tutorials/getting-started
    - theme: alt
      text: API Reference
      link: /api/

features:
  - title: Thin by design
    details: A modern API layered on top of the official MongoDB driver — the driver is never hidden, always accessible.
  - title: Pre/post hooks
    details: Transform documents before insert/update or react after any operation, with typed contexts per method.
  - title: Server-side validation
    details: JSON Schema (`$jsonSchema`) validation enforced by MongoDB itself at collection level, not just at the client.
  - title: Injection-safe by default
    details: Sanitize untrusted filters, a sanitized `MongoatError` hierarchy, and Proxy-gated method access.
  - title: Native escape hatch
    details: Drop down to the native `Collection`/`Db`/`MongoClient` any time — full control, no lock-in.
  - title: Type-safe end to end
    details: Generic models, typed hooks, and typed validation schemas throughout the public API.
---
