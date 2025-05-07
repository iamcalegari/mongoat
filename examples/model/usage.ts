/**
 * Usage example of the a model
 * @see https://github.com/iamcalegari/mongoat
 */

import { database, User } from './model';

const main = async () => {
  await database.connect();

  await database.cleanCollections();

  const document = await User.insert({
    username: 'foobar',
    mail: 'foo@bar.com',
    password: 'strongPassword',
    firstName: 'Foo',
    lastName: 'Bar',
  });

  console.log('DOCUMENT INSERTED: ', document.firstName); // Foo

  const updatedDocument = await User.update(
    { _id: document._id },
    {
      $set: {
        firstName: 'John',
        lastName: 'Doe',
      },
    }
  );

  console.log('DOCUMENT UPDATED: ', updatedDocument.firstName); // John

  await User.insert({
    username: 'anotherUser',
    mail: 'another@user.com',
    password: 'strongPassword',
    firstName: 'Another',
    lastName: 'User',
  });

  const documents = await User.findMany();

  console.log('ALL DOCUMENTS: ', documents.length); // 2

  await User.delete({ username: 'foobar' });
  const total = await User.total();

  console.log('TOTAL DOCUMENTS: ', total); // 1

  await database.disconnect();
};

main();
