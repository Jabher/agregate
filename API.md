# API

Package exposes 4 functions.
3 of them (Connection, Record, Relation) are classes, last one (acceptsTransaction) is decorator/decorator factory.
There is no default export.

```javascript
import {Connection, Record, Relation, acceptsTransaction} from 'active-graph-record'
//or
const {Connection, Record, Relation, acceptsTransaction} = require('active-graph-record')
```


documentation notes:
- 'public' keyword means method or property is intended to be overridden.
Well, it's JS so you can override everything, but those properties are intended to be defined

- 'static' keyword means (if you do not know) that it is class property

- internal interfaces and classes used for declaration are:
```
var primitiveType = bool | string | number
var dbPrimitiveType = primitiveType | Array<primitiveType>

interface WhereParams {
    //only records which corellate with all of the conditions will be returned
    [string: key]: dbPrimitiveType | {
        $gt?: number //greater than
        $gte?: number //greater than or equal
        $lt?: number //less than
        $lte?: number //less than or equal
        $exists?: bool //exists
        $startsWith?: Array<string> | string //string value starts with
        $endsWith?: Array<string> | string //string value ends with
        $contains?: Array<string> | string //string value contains
        $has?: Array<dbPrimitiveType> | dbPrimitiveType //db value contains passed arguments
        $in?: Array<dbPrimitiveType> | dbPrimitiveType //passed array contains db value
    }
}
interface WhereOpts {
    order?: string | Array<string>; // string should be key | key DESC | key ASC, e.g. ['created_at', 'friends DESC']
    offset?: number;
    limit?: number;
}

class Evented { //Evented is a subset of normal EventEmitter methods. No declaration provided, please refer to https://nodejs.org/api/events.html
    on()
    once()
    emit()
    removeAllListeners()
}
```
API is totally same to node's EventEmitter, it's just wrapper

## Connection, Transaction and SubTransaction
they all implements Queryable class and have following user API:
```typescript
interface Queryable {
    transaction(): Queryable; //Connection creates Transaction, Transaction creates SubTransaction

    //you will probably never need it explicitly, but who knows
    async query(CypherQuery): Neo4jResponse; //CypherQuery can be created using npm package 'cypher-talker'
    async query({query?: string, params?: Object, headers?: Object, lean?: boolean}): Neo4jResponse;

    //if this methods will be called over connection, they will throw an error
    //for subTransaction commit will do nothing, but rollback will rollback parent transaction
    async commit(): void;
    async rollback(): void;
}
```

## Record
```typescript
interface Record extends Evented {
    static async register(): void; //needs to be called for resolving purposes

    public static connection: Queryable;
    public static indexes: Iterable; //it's just indexed keys, nothing more
    public static label: string; //Class name by default. Used as label in DB
    public static connection: Queryable; //inheriting, so you only have define it somewhere and that's all

    [relationName: String]: dbPrimitiveType | Relation
    constructor(props?: Object)

    async where(params?: WhereParams, opts?: WhereOpts, transaction?: Queryable): Array<Record>
    async byUuid(uuid: string, transaction?: Queryable): Record
    async firstOrInitialize(params: Object, transaction?: Queryable): Record

    //note: this two props are looking on constructor properties by default
    public label: string;
    public connection: Queryable;

    public toJSON(): Object;

    //just hooks
    public beforeCreate(): void;
    public afterCreate(): void;
    public beforeUpdate(): void;
    public afterUpdate(): void;
    public beforeDestroy(): void;
    public afterDestroy(): void;

    async save(transaction?: Queryable): Record;
    async destroy(transaction?: Queryable): Record;
}

```

## Relation
```typescript
interface Relation {
    constructor(Record | Relation, label, opts?: {target?: Record, direction?: number = 1})

    async only(transaction?: Queryable): Record
    async only(null | Record, transaction?: Queryable): void

    async has(records: Array<Record>, transaction?: Queryable): bool
    async intersect(records: Array<Record>, transaction?: Queryable): Array<Record>
    async add(records: Array<Record>, transaction?: Queryable): void
    async delete(records: Array<Record>, transaction?: Queryable): void

    async clear(transaction?: Queryable): void
    async size(transaction?: Queryable): number
    async entries(transaction?: Queryable): Array<Record>

    async where(params?: WhereParams, opts?: WhereOpts, transaction?: Queryable): Array<Record>
}
```

## acceptsTransaction
decorator / decorator factory purposed to wrap methods in order they can accept a transaction as a last argument.

```javascript
function acceptsTransaction(props?: {force?: bool}): acceptsTransaction
function acceptsTransaction(target, name, descriptor)
```