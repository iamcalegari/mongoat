/**
 * Creation of a model example with a schema and indexes
 * @see https://github.com/iamcalegari/mongoat
 */

import { Database } from '@/database';
import {
  CreateIndexProps,
  ModelValidationSchema,
  SchemaWithDefaults,
} from '@/types';

import { METHODS } from '@/utils/enums';

export const database = new Database({
  dbName: 'mongoat-example',
});

interface UserSchema {
  username: string;
  password: string;
  mail: string;
  firstName: string;
  lastName: string;
}

const schema: ModelValidationSchema<SchemaWithDefaults<UserSchema>> = {
  bsonType: 'object',
  properties: {
    username: { bsonType: 'string', description: 'Username of the user' },
    password: { bsonType: 'string', description: 'Password of the user' },
    mail: {
      bsonType: 'string',
      description: 'Mail of the user',
      pattern: '^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$',
    },
    firstName: { bsonType: 'string', description: 'First name of the user' },
    lastName: { bsonType: 'string', description: 'Last name of the user' },
    insertedAt: { bsonType: 'date', description: 'Date of the user creation' },
    updatedAt: {
      bsonType: 'date',
      description: 'Date of last update of the user',
    },
  },
  required: ['firstName', 'lastName', 'mail', 'password', 'username'],
};

const indexes: CreateIndexProps[] = [
  {
    key: { username: 1, mail: 1 },
    name: 'unique_username_mail',
    unique: true,
  },
];

export const User = Database.defineModel<UserSchema>({
  collectionName: 'users',
  schema,
  indexes,
  validity: true,
  documentDefaults: {
    insertedAt: new Date(),
  },
});

User.pre<UserSchema>(METHODS.INSERT, function () {
  this.password = 'hashedPassword';
});
