/**
 * This is an example of how to connect to a database and get information about it
 * @see https://github.com/iamcalegari/mongoat
 */

import { Database } from '@/database';

/*
  If you want to connect to a remote database or a custom local database,
  you can use the following code:
  
  const database = new Database({
    uri: 'mongodb://<username>:<password>/',
    username: '127.0.0.1',
    password: '27017',
  });

  Or just setup the environment variables:

  MONGODB_URI -> for the uri
  MONGODB_USERNAME -> for the username
  MONGODB_PASSWORD -> for the password

  PS.: If you use the environment variables, they will be used by default,
  you don't need to pass the username and password.
  PS.: If you don't set anything, it will use the default values.
*/

const database = new Database({
  /*
    If you want to connect to a database with a custom name,
    you can set the following property:

    dbName: '<MY_DB_NAME>',

    Or just set the environment variable:

    MONGODB_DB_NAME -> for the database name
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

/*
  [CONSOLE LOG]:

  Database info:  {
    db: 'mongoat-example',
    collections: 0,
    views: 0,
    objects: 0,
    avgObjSize: 0,
    dataSize: 0,
    storageSize: 0,
    indexes: 0,
    indexSize: 0,
    totalSize: 0,
    scaleFactor: 1,
    fsUsedSize: 0,
    fsTotalSize: 0,
    ok: 1,
    '$clusterTime': {
      clusterTime: new Timestamp({ t: 1741628240, i: 1 }),
      signature: {
        hash: Binary.createFromBase64('AAAAAAAAAAAAAAAAAAAAAAAAAAA=', 0),
        keyId: 0
      }
    },
    operationTime: new Timestamp({ t: 1741628240, i: 1 })
  }
*/
