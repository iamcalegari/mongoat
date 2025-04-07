import { MongoClientOptions } from 'mongodb';

export interface DatabaseConfig extends MongoClientOptions {
  uri?: string;
  dbName?: string;
  username?: string;
  password?: string;
}
