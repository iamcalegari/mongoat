/**
 *
 * @Schema('users')
 * export class UserSchema implements userSchema {
 *
 *  @Description('Username of the user')
 *  username: string;
 *
 *  @Description('Password of the user')
 *  @Pre('insert', hashPassword)
 *  password: string;
 *
 *  @Description('Mail of the user')
 *  @Pattern('^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$')
 *  mail: srting;
 *
 *  @Description('First name of the user')
 *  firstName: string;
 *
 *  @Description('Last name of the user')
 *  lastName: string;
 *
 *  @Optional()
 *  @Description('Gender of the user')
 *  gender?: string;
 *
 * }
 *
 *
 * const indexes = new Index({
 *  key: { username: 1, mail: 1 },
 *  name: 'unique_username_mail',
 *  unique: true,
 * })
 *
 *
 * export const User = database.createModel<userSchema> {
 *  schema: UserSchema;
 *  indexes: indexes;
 *  collectionName: 'users';
 *  allowedMethods: ['find', 'findMany', 'findMany', 'insert', 'total', 'update', 'updateMany', 'delete', 'deleteMany'];
 * }
 *
 */
