# ActiveRecord es6/7-oriented implementation over neo4j
_this software is early alpha stage and is not supposed to be used in production_
## Why?

1. I hate schemas. 
No, I do not have something personal against them, but actual schema usages are not totally DRY and can cause an error. 
There is type declarations in language and framework, in migrations and in database.
Every SQL lib tries to implement their own scenario of handling difference between application schema and DB schema.
Only "good" solutions are tight integration with DB (tight is bad by default, except some cases) and some CLIs (which requires framework-alike structure)

2. There is no good ActiveRecord implementation in JS.
There are Waterline and Sequelize which are nice, but not, emm... ActiveRecord-ish.
I love node.js but since I came from Rails I was just expecting for something as good in terms of ORM/ODM as Rails's ActiveRecord.

3. Because I can.

## About the solution

The target that was expected to be accomplished is to implement schema-less class-based models for DB reflection.
 
Finally, there are only 2 drawbacks:
1. you need to register any created class.
2. relations are async.

## Usage example

```javascript
import {Record, connect} from 'active-graph-record'
connect('http://neo4j:neo4j@localhost:7474')

class User extends Record {
    debug () {console.log({...this})}
}

User.register()

async function main () {
    const user = new User({first_name: 'John', last_name: 'Doe'})
    await user.save()
    const [resolvedUser] = await User.where({first_name: 'Jonh'})
    resolvedUser.debug() // => {first_name: 'John', last_name: 'Doe', uuid: '###', created_at: ###, updated_at: ###}
}
```

Yes, UUIDv4 is used instead of primary key. But you can ignore it (unless you're trying to hack the lib)
Created_at and updated_at can be used for sort.
 
## API

```typescript
class Record {
    static label: string //class name by default; can be overriden

    static register(): void   
    
    static async where(properties?: Object): Array<Record> 
    
    [property: string]: boolean | number | string
    
    constructor (properties?: Object)
    
    getRelation(relationLabel: string, {targetLabel?: string, direction: [-1,0,1]}): Relation
    
    async save(properties?: Object): void 
    async delete(): void 
}
```


## Relations?
Yes, there are full-featured relations, see API.
All of the relations are non-directed polymorphic many-to-many, but actually you can not care about that.
Just think about relation as about async Set as interface is nearly same (except properties for Relation#entries).

```typescript
class Relation {
    async size(): number
    async has(...records: Array<Record>): boolean
    async hasDeep(...records: Array<Record>): boolean
    async add(record: Record): void
    async add(...records: Array<Record>): void
    async delete(record: Record): void
    async delete(...records: Array<Record>): void
    async entries(properies?: Object, type?: string): Array<Record>
}
```

If you need both direct and back relation, use same label:
```javascript
class ExampleObject extends Record {
    get subjects() { return this.getRelation('relation') }
}
ExampleObject.register()
class ExampleSubject extends Record {
    get objects() { return this.getRelation('relation') }
}
ExampleSubject.register()
```

##FAQ
#### How to extend something?
create class methods

#### How to save dates?


#### How to validate?
create getter and setter and validate there. Or create decorator (when @sebmck will bring their support back to babel).

#### How to...
Just use your imagination. It's just common ES6 class which is getting dumped to db from `{...this}` - taking only enumerable props.

## Roadmap
- [x] sort
- [x] offset and limit
- [x] has
- [x] deep relations
- [ ] indexes
- [ ] total test coverage
- [ ] performance optimisations
