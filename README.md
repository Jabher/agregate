# Agregate
##### A "missing piece" of DB clients for Node.JS, accenting on familiar JS experience, developer's freedom and simplicity of usage

> Programmers waste enormous amounts of time thinking about, or worrying about, the speed of noncritical parts of their programs, and these attempts at efficiency actually have a strong negative impact when debugging and maintenance are considered. **Donald Knuth**

_**disclaimer**: this software is beta stage and is not intended to be used in heavy production projects. I am is not responsible for data loss and corruption, lunar eclipses and dead kittens._

#### Enviroment and preparations
Agregate's only back-end for now is [neo4j](http://neo4j.com) (v2 and v3 beta are supported) for now. You can [install](http://neo4j.com/docs/stable/server-installation.html) it or [request a free SaaS sandbox trial](http://neo4j.com/sandbox/). 

[This](https://github.com/Jabher/agregate/blob/master/.babelrc) (es6, es2015, plus decorators, static class properties and bind operator) babel preset is recommended to be used for the best experience. However, library is shipped with compiled to ES5 files by default.

#### Familiar JS experience
So, you need User class reflecting DB "table". You simply write
```javascript
class User extends Record {}

const user = new User({name: 'foo'})
user.surname = 'bar'
user.save()
.then(() => User.where({name: 'foo'}))
.then(([user]) => console.log(user))  // => User { name: 'foo', surname: 'bar' }
```
No factories, complex configs and CLI tools.
Every enumerable property (except relations, but it will be explained later) is reflectable into DB, back and forth.

#### Developer's freedom
Common DB lib usually requires you to keep specific file structure and/or using CLI tools and/or remember hundreds of methods, properties and signatures.
**Agregate** was aimed to keep [Minimal API Surface Area](http://2014.jsconf.eu/speakers/sebastian-markbage-minimal-api-surface-area-learning-patterns-instead-of-frameworks.html). Agregate API is fully promise-based, Relation is trying to mimic Set API, and Record instance has just 2 core methods - Record#save and Record#delete, whose API is obvious.

#### Simplicity of usage
The whole declaration of class would be something like:
```javascript
const {Connection, Record} = require('agregate')
//class name will be used as "table name". You can overload it with static "label" property
class Entry extends Record {
    //indexes are optional static properties which are used only for making DB query 'CREATE INDEX' during register() call. 
    static indexes = new Set('foo', 'bar')
    //for now agregate is backed by npmjs.com/package/neo4j, so Connection constructor is just proxying everything up to that package. You can usually just use URL string syntax
    //static properties are inheritable, so you only need to declare in once in parent class
    static connection = new Connection('http://neo4j:password@localhost:7474');
}
//As we cannot have a callbacks on class constructor (at least without crazy hacks) explicit .register() call is required for any concrete class
Entry.register() 
```

#### Wait, but I need relations
OK, let's add relations.
```javascript
const {Connection, Record, Relation} = require('agregate')
//we assume that we already made something like Record.connection = ...

class RecordObject extends Record {
    //signature of constructor is 
    //(source: Record|Relation, label: string[, {target?: RecordClass, direction?: number = 1}])
    subjects = new Relation(this, 'relation');
}

class RecordSubject extends Record {
    //target is limitation of relation to one record group, and direction is, well, direction. Direction is 1 by default, which is '->' relation. -1 relation is '<-'. It means there can be 2 relations with same label in different directions. 0-relation is plain '-', there can be only 1 relation of this type.
    subjects = new Relation(this, 'relation', {target: Object, direction: -1});
}

RecordObject.register()
RecordSubject.register()

async function main() {
    const object = await new RecordObject({foo: 'bar'}).save()
    const subject = await new RecordSubject().save()
    await object.subjects.add(subject)

    console.log(await subject.objects.size()) // => 1
    const objects = await subject.objects.entries()
    console.log(objects[0].foo) => //bar
}
```

Deep relations are simple as hell:

```javascript
import Role from './role'
import Permission from './permission'
export default class User extends ConnectedRecord {
    roles = new Relation(this, 'has_role', {target: Role});
    permissions = new Relation(this.roles, 'has_permission', {target: Permission});
    hasPermission = ::this.permissions.has
}
```
Relation instances have bunch of pretty methods to use:
```javascript
class Relation {
    //overloaded method to implement one-to-one relation
    async only(): Record
    async only(null | Record): void
    //just for you to know: signature of Record.where and Relation#where are 100% same
    async where(params?: WhereParams, opts?: WhereOpts): Array<Record>
    
    //only non-familiar method. Returs intersection of relation and passed set
    async intersect(records: Array<Record>): Array<Record>
    
    //this part mimics es6 Set class
    async add(records: Array<Record>): void
    async clear(): void
    async delete(records: Array<Record>): void
    async entries(): Array<Record>
    async has(records: Array<Record>): bool
    //note: size is not property, but async method
    async size(): number
}
```

#### Auto-generated record properties 

all of the properties are non-enumerable, non-configurable and exists only for reflected record.

- **uuid** - automatically generated on creation
- **createdAt** - automatically generated on creation
- **updatedAt** - automatically generated on creation and update

#### OK, but how can I make complex queries?

**Record.where** and **Relation#where** methods are provided for querying.

All details are provided in API page, in brief - order, limit, offset can be used for filtering. Equality, existence, numeric (greater/less), string (starts/ends with, contains), array (contains/includes) queries are provided.

Examples:
```javascript
Entry.where({foo: 1000}, {limit: 10, offset: 10, order: 'createdAt'})
Entry.where({updatedAt: {$gte: Date.now() - 1000}}, {order: ['createdAt DESC']})
Entry.where({foo: {$exists: true, $startsWith: ['b', 'ba', 'baz'], $endsWith: 'bar', $contains: 'z'}})

// here e.g. {foo: [1,2,3,4,5], bar: 3} will be reflected.
// $has stands for "db record has fields", $in - for "db record is in list of possible fields"
Entry.where({foo: {$has: [1,2,3]}, bar: {$in: [1,2,3]}})

//$in can also work with array
Entry.where({foo: {$in: [[0], [1,2,3,4,5]]}}})
```

#### Hooks?

**beforeCreate**, **afterCreate**, **beforeUpdate**, **afterUpdate**, **beforeDestroy**, **afterDestroy** are available hooks

```javascript
class Entry extends Record {
    async beforeCreate() {
        //this.connection points to transaction during the transaction, so you have to pass it if calling other classes
        const test = await Test.where({id: this.id}, this.connection)
        this.testId = test.testId
    }
}
```

#### Transactions and atomicity?

Yes, Agregate has transactions.

Hooks (see above) are always ran inside a transaction (transaction is same for pre-hook, operation itself and post-hook).

Decorator **@acceptsTransaction({force: true})** can be used _(with babel-plugin-transform-decorators-legacy, will be changed to new syntax when new spec will become stable)_, or transaction can be constructed explicitly by connection.transaction()

All transactions should be committed or rolled back. Decorator commits everything automatically on success, rolls back on error.

On **SIGINT** Agregate will attempt to rollback all not closed yet transactions. By default Neo4j rolls back transactions in 60 seconds after last query.

Good example of transaction usage is provided **Record.firstOrCreate** sugar-ish method:

```javascript
class Record {
    @acceptsTransaction
    static async firstOrInitialize(params) {
        const tx = this.connection.transaction()
        let [result] = await this.where(params, {limit: 1}, tx.transaction())
        if (!result)
            result = await new this().save(params, tx.transaction())
        await tx.commit()
        return result
    }
}
```

#### Roadmap
- [x] sort
- [x] offset and limit
- [x] has
- [x] deep relations
- [x] indexes
- [x] rich Record.where query syntax ($lt, $gt, $lte, $gte, $has, $in and so on)
- [x] one-to-one relations
- [ ] relations validation
- [ ] total test coverage
- [ ] performance optimisations
- [ ] optimistic and pessimistic locks?
- [x] tests for transaction usage
- [ ] tests for eventEmitter
