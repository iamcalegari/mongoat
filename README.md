<p align="center">
  <img src="https://github.com/iamcalegari/mongoat/blob/main/graphics/mongoat-cover-4_1.png" alt="Mongoat Logo" width="600"/>
</p>

<h1 align="center">MONGOAT</h1>
<p align="center"><b>Fast MongoDB ODM</b></p>

<p align="center">
  <a href="https://github.com/iamcalegari/mongoat/actions/workflows/ci.yml">
    <img src="https://github.com/iamcalegari/mongoat/actions/workflows/ci.yml/badge.svg" alt="Build Status"/>
  </a>
  <a href="https://www.npmjs.com/package/@iamcalegari/mongoat">
    <img src="https://img.shields.io/npm/v/mongoat.svg" alt="NPM Version"/>
  </a>
</p>

---

Mongoat is a fast, extensible, and type-safe ODM (Object Document Mapper) for MongoDB, designed for Node.js environments. It focuses on high performance and flexibility, providing a modern API and advanced extensibility compared to existing solutions.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Connecting to MongoDB](#connecting-to-mongodb)
  - [Defining a Model](#defining-a-model)
  - [Basic CRUD Usage](#basic-crud-usage)
- [Advanced Usage](#advanced-usage)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- Blazing fast performance
- Simple, intuitive API
- Schema validation and hooks
- TypeScript support
- Easy extensibility

## Installation

```bash
npm install @iamcalegari/mongoat

yarn add @iamcalegari/mongoat

pnpm add @iamcalegari/mongoat
```

## Quick Start

### Connecting to MongoDB

```js
import { Database } from '@iamcalegari/mongoat';

const database = new Database({
  /**
   *
   * If you want to connect to a database with a custom name,
   * you can set the following property:
   *
   * dbName: '<MY_DB_NAME>',
   *
   * Or just set the environment variable:
   *
   * MONGODB_DB_NAME -> for the database name
   */
  dbName: 'mongoat-example',
});

const dbConnection = async () => {
  await database.connect();

  const info = await database.info();

  console.log('Database info: ', info);

  await database.disconnect();
};

dbConnection();
```

### Defining a Model
