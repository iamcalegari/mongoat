import { MongoClientOptions } from 'mongodb';

export interface DatabaseConfig extends Partial<MongoClientOptions> {
  uri?: string;
  dbName?: string;
  username?: string;
  password?: string;
}
