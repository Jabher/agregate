# ActiveRecord es6/7-oriented implementation over neo4j
_this software is alpha stage and is not supposed to be used in production_
## What is it?

ActiveRecord is common pattern that is, speaking in general

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
    const user = new User({first_name: 'John'})
    user.last_name = 'Doe'
    await user.save()
    const [resolvedUser] = await User.where({first_name: 'Jonh'})
    resolvedUser.debug() // => {first_name: 'John', last_name: 'Doe', uuid: '###', created_at: ###, updated_at: ###}
}
```

UUIDv4 is used instead of primary key. But you can ignore it (unless you're trying to hack the lib)
Created_at and updated_at can be used for sorting purposes.
 
## API

```typescript
export class Record {
    static indexes: Enumerable<String>
    static label: string //class name by default; can be overriden
    static register(): void   
    static async where(properties?: Object): Array<Record> 
    
    [property: string]: boolean | number | string | Relation
    
    constructor (properties?: Object)
    
    async save(properties?: Object): void 
    async delete(): void     
}
```


## Relations
Yes, there are fully-featured relations, see API.
All of the relations are non-directed polymorphic many-to-many, but actually you can not care about that.
Just think about relation as about async Set as interface is nearly same (except properties for Relation#entries).

```typescript
var RecordSet = Array<Record> | Promise<Record | Array<Record>>  

export class Relation {
    constructor(sourceNode: Record | Relation, relationLabel: string, {target?: Record, direction: [-1,0,1]})
    async size(): number
    async has(records: RecordSet | ...records: RecordSet): boolean
    async intersect(records: RecordSet | ...records: RecordSet): Array<Records>
    async add(records: RecordSet | ...records: RecordSet): void
    async delete(records: RecordSet | ...records: RecordSet): void
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

Deep relations? No problem. Of course, you cannot add elements there 
(as far as it's unknown to which intermediate node to connect them)
but you can do everything else.

```javascript
class SourceObject extends Record {
    constructor(...args) {
        super(...args)
        const intermediateRelation = new Relation(this, 'rel1', {target: IntermediateObject})
        this.defineRelations({
            intermediateObjects: intermediateRelation,
            endObjects: new Relation(intermediateRelation, 'rel2', {target: EndObject})
        })
    }
}
```

## Hooks

There are 6 hooks: before and after create, update and delete. Fully hooked record class will look like this:

```javascript
class User extends Record {
    async beforeCreate(query) { await query(Cypher.tag`something...`) }
    async afterCreate(query) { await query(Cypher.tag`something...`) }
    async beforeUpdate(query) { await query(Cypher.tag`something...`) }
    async afterUpdate(query) { await query(Cypher.tag`something...`) }
    async before(query) { await query(Cypher.tag`something...`) }
}
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
