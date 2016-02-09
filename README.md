# ActiveRecord implementation for ES2015 with neo4j as back-end
_this software is beta stage and is not intended to be used in serous production projects_
_developers of this software are not responsible for data loss and corruption, lunar eclipses and dead kittens_

## What is it?

ActiveRecord is common pattern in software development which declares that there is special class or classes who are
responsible for database reflection, line-by-line or node-by-node.

Neo4j is Graph Database, it's schema-less and ACID-compliant.

## How to use it?

Dead simple. It's mostly purposed for ES2015-featured JavaScript, so all of the examples are written using it.
```javascript
const {Connection, Record} = require('active-graph-record')

class Entry extends Record {
    static connection = new Connection('http://neo4j:password@localhost:7474');
}

Entry.register() //creates indexes and makes some internal magic for resolving

async function main() {
    const entry = new Entry()
    entry.foo = 'bar'
    await entry.save()

    const entries = await Entry.where({foo: 'bar'})
    console.log(entries.length) // => 1
    console.log(entries[0].foo) // => 'bar'
}
```

## Wait, but I need relations

no problems. It's dead simple too:

```javascript
const {Connection, Record, Relation} = require('active-graph-record')
class ConnectedRecord extends Record {
    static connection = new Connection('http://neo4j:password@localhost:7474');
}

class RecordObject extends ConnectedRecord {
    subjects = new Relation(this, 'relation' /*internal relation label-name*/);
}

class RecordSubject extends ConnectedRecord {
    //target is optional! and direction is optional too, it should be -1 for reverse relations.
    subjects = new Relation(this, 'relation', {target: Object, direction: -1});
}

RecordObject.register()
RecordSubject.register()

async function main() {
    const object = await new RecordObject({baz: true}).save()
    const subject = await new RecordSubject().save()
    await object.subjects.add(subject)

    console.log(await subject.objects.size()) // => 1
    const objects = await subject.objects.entries()
    console.log(objects[0].baz) => //true
}
```

even for deep relations:

```javascript
class User extends ConnectedRecord {
    roles = new Relation(this, 'has_role', {target: Role});
    permissions = new Relation(this.roles, 'has_permission', {target: Permission});

    async hasPermission(permission) {
        return await this.permissions.has(permission)
    }
}

class Role extends ConnectedRecord {
    users = new Relation(this, 'has_role', {target: Role, direction: -1});
    permissions = new Relation(this, 'has_permission', {target: Permission});
}

class Permission extends ConnectedRecord {
    roles = new Relation(this, 'has_permission', {target: Role, direction: -1});
    users = new Relation(this.roles, 'has_role', {target: User, direction: -1});
}
```
## Automatic fields

AGR automatically brings **uuid** key (cannot be re-defined), **created_at** and **updated_at** fields when record is reflected

## OK, but how can I make complex queries?

Record and Relation have static **where** method to use for querying.
All details are provided in API page, in brief - order, limit, offset can be used for filtering,
equality, existence, numeric (greater/less), string (starts/ends with, contains), array (contains/includes) queries are available

Examples:
```javascript
Entry.where({foo: 1000}, {limit: 10, offset: 10, order: 'created_at'})
Entry.where({updated_at: {$gte: Date.now() - 1000}}, {order: ['created_at DESC']})
Entry.where({foo: {$exists: true, $startsWith: ['b', 'ba', 'baz'], $endsWith: 'bar', $contains: 'z'}})

// here e.g. {foo: [1,2,3,4,5], bar: 3} will be reflected.
// $has stands for "db record has fields", $in - for "db record is in list of possible fields"
Entry.where({foo: {$has: [1,2,3]}, bar: {$in: [1,2,3]}})

//$in can also work with array
Entry.where({foo: {$in: [[0], [1,2,3,4,5]]}}})
```

## Hooks?

Sure. beforeCreate, afterCreate, beforeUpdate, afterUpdate, beforeDestroy, afterDestroy are available hooks

```javascript
class Entry extends Record {
    async beforeCreate() {
        //this.connection points here to transaction, so you have to pass it if calling other classes
        const test = await Test.where({id: this.id}, this.connection)
        this.testId = test.testId
    }
}
```

## Transactions and atomicity?

AGR provides simple transactions engine.
Hooks (see above) are always inside a transaction.
They can be used by using special decorator **@acceptsTransaction({force: true})** or called explicitly by connection.transaction()
All transactions should be committed or rolled back.
On **SIGINT** AGR will attempt to rollback all not closed yet transactions.

Good example is Record#firstOrCreate sugar-ish method:

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

## Roadmap
- [x] sort
- [x] offset and limit
- [x] has
- [x] deep relations
- [x] indexes
- [x] rich Record.where query syntax ($lt, $gt, $lte, $gte, $has, $in and so on)
- [ ] relations validation
- [x] one-to-one relations
- [ ] total test coverage
- [ ] performance optimisations
- [ ] optimistic and pessimistic locks?
- [x] tests for transaction usage
- [ ] tests for eventEmitter