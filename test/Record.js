import 'babel-polyfill'
import chai, {expect} from 'chai'
chai.use(require('chai-spies'))
import {Cypher} from 'cypher-talker'

const {Record: RefRecord, GraphConnection, Relation} = global
const connection = new GraphConnection('http://neo4j:password@localhost:7474')
class Record extends RefRecord {
    static connection = connection
}
const query = connection.query.bind(connection)

describe('ActiveRecord', () => {
    class Test extends Record {}
    beforeEach(async() =>
        await query(Cypher.tag`MATCH (n) DETACH DELETE n`))
    beforeEach(async() =>
        await Test.register())

    describe('classes', () => {
        let instance
        const opts = {id: 1}
        beforeEach(async() =>
            await (instance = new Test(opts)).save())

        it('should create new record', async() =>
            expect(await Test.byUuid(instance.uuid))
                .to.deep.include(opts))
        it('should create new record by Record#firstOrInitialize', async() =>
            expect(await Test.firstOrInitialize(opts))
                .to.deep.include(opts))
        it('should return existing record if exists by Record#firstOrInitialize', async() =>
            expect(await Test.firstOrInitialize(opts))
                .to.deep.include({uuid: instance.uuid}))
        it('should destroy existing record', async() => {
            const uuid = instance.uuid
            await instance.destroy()
            expect(instance.uuid).to.equal(undefined)
            expect(await Test.byUuid(uuid)).to.equal(undefined)
        })
    })
    describe('props', () => {
        let instance
        const testString = 'testString'
        const testDate = Date.now()
        const testNumber = Math.floor(Math.random() * 1000000) + 1
        const opts = {id: 1, testString, testDate, testNumber}

        beforeEach(async() =>
            await (instance = new Test(opts)).save())

        it('should create new record with props', async() =>
            expect(await Test.byUuid(instance.uuid))
                .to.deep.include(opts))
        it('should save updated props', async() => {
            instance.testNumber = testNumber * 2
            await instance.save()
            expect(await Test.byUuid(instance.uuid))
                .to.deep.include({...instance})
        })
    })

    describe('relations', () => {
        class TestObject extends Record {
            subjects = new Relation(this, 'relation')
        }
        class TestSubject extends Record {
            subjects = new Relation(this, 'relation')
            objects = new Relation(this, 'relation', {direction: -1})
        }
        let object
        let subject
        before(() => {
            TestObject.register()
            TestSubject.register()
        })
        beforeEach(async() => {
            await (object = new TestObject()).save()
            await (subject = new TestSubject()).save()
        })

        describe('prequisitions', () => {
            it('should be empty', async() =>
                expect([...await object.subjects.entries()]).to.be.empty)
            it('should have size 0', async() =>
                expect(await object.subjects.size()).to.be.equal(0))
        })
        describe('promise-management', () => {
            it('should support promise entry sources', async() => {
                await object.subjects.add(TestSubject.where({uuid: subject.uuid}))
                expect(await object.subjects.size()).to.be.equal(1)
            })
        })
        describe('manipulations', () => {
            beforeEach(async() =>
                await object.subjects.add(subject))

            it('should successfully resolve subjects', async() =>
                expect(await object.subjects.size()).to.be.equal(1))
            it('should successfully resolve subjects using Relation#entries', async() =>
                expect(await object.subjects.entries()).to.has.length(1))
            it('should contain reverse relations using Relation#entries', async() =>
                expect(await subject.objects.entries()).to.has.length(1))
            it('should contain shared namespace but different direction relations using Relation#entries', async() =>
                expect(await subject.subjects.entries()).to.has.length(0))
            it('should resolve objects of subject', async() =>
                expect(await subject.objects.entries()).to.has.length(1))
            it('should resolve objects of subject by props', async() =>
                expect(await subject.objects.where({uuid: object.uuid})).to.has.length(1))
            it('should not resolve objects not of subject by props', async() =>
                expect(await subject.objects.where({uuid: (await new TestObject().save()).uuid})).to.has.length(0))
            it('should resolve intersect objects using Relation#intersect', async() =>
                expect(await subject.objects.intersect(
                    object,
                    new TestObject().save()
                )).to.have.length(1))
            it('should resolve objects of subject by #has', async() =>
                expect(await subject.objects.has(TestObject.where({}))).to.be.equal(true))
            it('should not resolve wrong objects by #has', async() =>
                expect(await subject.objects.has(TestSubject.where({}))).to.be.equal(false))
            it('should successfully delete subjects using Relation#delete', async() => {
                const [entry] = await object.subjects.entries()
                await object.subjects.delete(entry)
                expect(await object.subjects.size()).to.be.equal(0)
            })
            it('should successfully delete subjects using Relation#delete and promises', async() => {
                await object.subjects.delete(object.subjects.entries())
                expect(await object.subjects.size()).to.be.equal(0)
            })
            it('should successfully delete subjects using Relation#clear', async() => {
                await object.subjects.clear()
                expect(await object.subjects.size()).to.be.equal(0)
            })

            describe('with transaction', () => {
                let transaction,
                    sub
                beforeEach(async() => {
                    transaction = connection.transaction()
                    sub = transaction.sub
                    await object.subjects.add(subject, sub)
                })
                afterEach(async() =>
                    await transaction.commit())

                it('should successfully resolve subjects', async() =>
                    expect(await object.subjects.size(sub)).to.be.equal(1))
                it('should successfully resolve subjects using Relation#entries', async() =>
                    expect(await object.subjects.entries(sub)).to.has.length(1))
                it('should contain reverse relations using Relation#entries', async() =>
                    expect(await subject.objects.entries(sub)).to.has.length(1))
                it('should contain shared namespace but different direction relations using Relation#entries', async() =>
                    expect(await subject.subjects.entries(sub)).to.has.length(0))
                it('should resolve objects of subject', async() =>
                    expect(await subject.objects.entries(sub)).to.has.length(1))
                it('should resolve objects of subject by props', async() =>
                    expect(await subject.objects.where({uuid: object.uuid}, sub)).to.has.length(1))
                it('should not resolve objects not of subject by props', async() =>
                    expect(await subject.objects.where({uuid: (await new TestObject().save()).uuid}, sub)).to.has.length(0))
                it('should resolve intersect objects using Relation#intersect', async() =>
                    expect(await subject.objects.intersect(
                        object,
                        new TestObject().save(),
                        sub
                    )).to.have.length(1))
                it('should resolve objects of subject by #has', async() =>
                    expect(await subject.objects.has(TestObject.where({}, sub))).to.be.equal(true))
                it('should not resolve wrong objects by #has', async() =>
                    expect(await subject.objects.has(TestSubject.where({}, sub))).to.be.equal(false))
                it('should successfully delete subjects using Relation#delete', async() => {
                    const [entry] = await object.subjects.entries(sub)
                    await object.subjects.delete(entry, sub)
                    expect(await object.subjects.size(sub)).to.be.equal(0)
                })
                it('should successfully delete subjects using Relation#clear', async() => {
                    await object.subjects.clear(sub)
                    expect(await object.subjects.size(sub)).to.be.equal(0)
                })
            })
        })

        describe('deep', () => {
            class TestSourceObject extends Record {
                intermediateObjects = new Relation(this, 'rel1', {target: TestIntermediateObject})
                endObjects = new Relation(this.intermediateObjects, 'rel2', {target: TestEndObject})
            }
            class TestIntermediateObject extends Record {
                endObjects = new Relation(this, 'rel2', {target: TestEndObject})
            }
            class TestEndObject extends Record {
            }

            let startObject
            let midObject
            let endObject
            before(() => {
                TestSourceObject.register()
                TestIntermediateObject.register()
                TestEndObject.register()
            })

            beforeEach(async() => {
                await (startObject = new TestSourceObject()).save()
                await (midObject = new TestIntermediateObject()).save()
                await (endObject = new TestEndObject()).save()

                // spoofing for tests whether they are not captured by accident

                await new TestSourceObject().save()
                await new TestIntermediateObject().save()
                await new TestEndObject().save()
            })
            describe('prequisitions', () => {
                it('should be empty by default using Relation#size', async() =>
                    expect(await startObject.endObjects.size()).to.equal(0))
                it('should be empty by default using Relation#entries', async() =>
                    expect(await startObject.endObjects.entries()).to.have.length(0))
            })
            describe('manipulations', () => {
                beforeEach(async() => {
                    await startObject.intermediateObjects.add(midObject)
                    await midObject.endObjects.add(endObject)
                })
                it('should contain 1 item using Relation#size', async() =>
                    expect(await startObject.endObjects.size()).to.equal(1))
                it('should contain 1 item using Relation#entries', async() =>
                    expect(await startObject.endObjects.entries()).to.have.length(1))
                it('should contain endItem', async() =>
                    expect(await startObject.endObjects.entries()).to.have.deep.property('[0].uuid', endObject.uuid))
                it('should remove the item using Relation#clear', async() => {
                    await startObject.endObjects.clear()
                    expect(await startObject.endObjects.size()).to.equal(0)
                })
                it('should remove the item using Relation#delete', async() => {
                    await startObject.endObjects.delete(endObject)
                    expect(await startObject.endObjects.size()).to.equal(0)
                })
            })
        })
        describe('one-to-one', () => {
            beforeEach(async() =>
                await object.subjects.only(subject))

            it('should have a relation', async() =>
                expect(await object.subjects.entries()).to.have.length(1))
            it('should remove a relation', async() => {
                await object.subjects.only(null)
                expect(await object.subjects.entries()).to.have.length(0)
            })
            it('should resolve a relation', async() =>
                expect(await object.subjects.only()).to.deep.include({uuid: subject.uuid}))
        })
    })
    describe('self-relations', () => {
        class TestSelfObject extends Record {
            subjects = new Relation(this, 'ref')
        }
        let object1
        let object2
        before(() => {
            TestSelfObject.register()
        })
        beforeEach(async() => {
            await (object1 = new TestSelfObject()).save()
            await (object2 = new TestSelfObject()).save()
        })
        it('should not have item by default', async() => {
            expect({
                forward: await object1.subjects.has(object2),
                reverse: await object2.subjects.has(object1)
            }).to.deep.equal({
                forward: false,
                reverse: false
            })
        })

        it('should contain item', async() => {
            await object1.subjects.add(object2)
            expect({
                forward: await object1.subjects.has(object2),
                reverse: await object2.subjects.has(object1)
            }).to.deep.equal({
                forward: true,
                reverse: false
            })
        })

        it('should deeply contain item', async() => {
            const object3 = await new TestSelfObject().save()
            await object1.subjects.add(object2)
            await object2.subjects.add(object3)
            expect({
                forward: await object1.subjects.has(object3),
                reverse: await object2.subjects.has(object1)
            }).to.deep.equal({
                forward: false,
                reverse: false
            })
        })
    })

    describe('querying', () => {
        const test = 'test'
        let items
        beforeEach(async() =>
            items = await Promise.all(function*() {
                let idx = 0
                do yield new Test({idx, test}).save()
                while (idx++ < 5)
            }()))

        it('should reveal item by string prop', async() =>
            expect(await Test.where({test})).to.have.length(items.length))
        it('should reveal item by int prop', async() =>
            expect(await Test.where({idx: items[0].idx})).to.deep.include(items[0]))
        it('should support offset', async() => {
            const limit = 2
            const result = await Test.where({test}, {limit: 2, order: 'idx ASC'})
            expect(result).to.have.length(limit)
            expect(result.map(res => res.idx)).to.deep.equal([0, 1])
        })
        it('should support limit', async() => {
            const limit = 2
            const result = await Test.where({test}, {limit: 2, offset: 1, order: 'idx ASC'})
            expect(result).to.have.length(limit)
            expect(result.map(res => res.idx)).to.deep.equal([1, 2])
        })
    })
    describe('hooks', () => {
        let testRecord
        beforeEach(() =>
            testRecord = new Test())

        it(`should process create hooks`, async() => {
            const beforeHookName = `beforeCreate`
            const afterHookName = `afterCreate`
            testRecord[beforeHookName] = chai.spy(() =>
                expect(testRecord[afterHookName]).to.be.not.called())
            testRecord[afterHookName] = chai.spy(() =>
                expect(testRecord[beforeHookName]).to.be.called())
            await testRecord.save()
            expect(testRecord[beforeHookName], 'before hook').to.be.called.once()
            expect(testRecord[afterHookName], 'after hook').to.be.called.once()
        })
        it(`should process update hooks`, async() => {
            const beforeHookName = `beforeUpdate`
            const afterHookName = `afterUpdate`
            await testRecord.save()
            testRecord[beforeHookName] = chai.spy(() =>
                expect(testRecord[afterHookName]).to.be.not.called())
            testRecord[afterHookName] = chai.spy(() =>
                expect(testRecord[beforeHookName]).to.be.called())
            await testRecord.save()
            expect(testRecord[beforeHookName], 'before hook').to.be.called.once()
            expect(testRecord[afterHookName], 'after hook').to.be.called.once()
        })
        it(`should process destroy hooks`, async() => {
            const beforeHookName = `beforeDestroy`
            const afterHookName = `afterDestroy`
            await testRecord.save()
            testRecord[beforeHookName] = chai.spy(() =>
                expect(testRecord[afterHookName]).to.be.not.called())
            testRecord[afterHookName] = chai.spy(() =>
                expect(testRecord[beforeHookName]).to.be.called())
            await testRecord.destroy()
            expect(testRecord[beforeHookName], 'before hook').to.be.called.once()
            expect(testRecord[afterHookName], 'after hook').to.be.called.once()
        })

        it('should support transactions', async() => {
            const beforeQuery = new Promise((resolve, reject) =>
                testRecord.beforeCreate = async function (transaction) {
                    try {
                        expect(this.state).to.equal(1)
                        this.state = 2
                        Object.defineProperty(this, 'connection', {value: transaction, configurable: true})
                        expect(await Test.where({state: 1})).to.have.length(0)
                        expect(await Test.where({state: 2})).to.have.length(0)
                        resolve()
                    } catch (e) {
                        reject(e)
                        throw e
                    } finally {
                        delete this.connection
                    }
                })
            const afterQuery = new Promise((resolve, reject) =>
                testRecord.afterCreate = async function (transaction) {
                    try {
                        expect(this.state).to.equal(2)
                        Object.defineProperty(this, 'connection', {value: transaction, configurable: true})
                        expect(await Test.where({state: 1})).to.have.length(0)
                        expect(await Test.where({state: 2})).to.have.length(0)
                        resolve()
                    } catch (e) {
                        reject(e)
                        throw e
                    } finally {
                        delete this.connection
                    }
                })
            // important - no async keyword!
            testRecord.save({state: 1})
            await beforeQuery
            await afterQuery
            expect(await Test.where({state: 1})).to.have.length(0)
            expect(await Test.where({state: 2})).to.have.length(1)
        })
    })
    describe('querying', () => {
        describe('numbers', () => {
            beforeEach(() => Test.save({test: 1}, {test: 2}, {test: 3}))

            it('should support $lt', async() =>
                expect(await Test.where({test: {$lt: 2}}), {order: 'test'}).to.have.length(1)
                    .and.to.have.deep.property(`[0].test`, 1))
            it('should support $lte', async() =>
                expect(await Test.where({test: {$lte: 2}}, {order: 'test'})).to.have.length(2)
                    .and.to.have.deep.property(`[1].test`, 2))
            it('should support $gt', async() =>
                expect(await Test.where({test: {$gt: 2}}), {order: 'test'}).to.have.length(1)
                    .and.to.have.deep.property(`[0].test`, 3))
            it('should support $gte', async() =>
                expect(await Test.where({test: {$gte: 2}}, {order: 'test'})).to.have.length(2)
                    .and.to.have.deep.property(`[0].test`, 2))

            it('should support multiple $lt', async() =>
                expect(await Test.where({test: {$lt: [2, 3]}}), {order: 'test'}).to.have.length(1)
                    .and.to.have.deep.property(`[0].test`, 1))
            it('should support multiple $lte', async() =>
                expect(await Test.where({test: {$lte: [2, 3]}}, {order: 'test'})).to.have.length(2)
                    .and.to.have.deep.property(`[1].test`, 2))
            it('should support multiple $gt', async() =>
                expect(await Test.where({test: {$gt: [2, 1]}}), {order: 'test'}).to.have.length(1)
                    .and.to.have.deep.property(`[0].test`, 3))
            it('should support multiple $gte', async() =>
                expect(await Test.where({test: {$gte: [2, 1]}}, {order: 'test'})).to.have.length(2)
                    .and.to.have.deep.property(`[0].test`, 2))

        })
        describe('strings', () => {
            beforeEach(() => Test.save({test: 'abcde'}, {test: 'ecdba'}, {test: 'foo'}))
            it('should support $startsWith', async() =>
                expect(await Test.where({test: {$startsWith: 'abc'}})).to.have.length(1)
                    .and.to.have.deep.property(`[0].test`, 'abcde'))
            it('should support $endsWith', async() =>
                expect(await Test.where({test: {$endsWith: 'cde'}})).to.have.length(1)
                    .and.to.have.deep.property(`[0].test`, 'abcde'))
            it('should support $contains', async() =>
                expect(await Test.where({test: {$contains: 'a'}})).to.have.length(2))

            it('should support multiple $startsWith', async() =>
                expect(await Test.where({test: {$startsWith: ['abc', 'ab']}})).to.have.length(1)
                    .and.to.have.deep.property(`[0].test`, 'abcde'))
            it('should support multiple $endsWith', async() =>
                expect(await Test.where({test: {$endsWith: ['cde', 'de']}})).to.have.length(1)
                    .and.to.have.deep.property(`[0].test`, 'abcde'))
            it('should support multiple $contains', async() =>
                expect(await Test.where({test: {$contains: ['a', 'b']}})).to.have.length(2))
        })
        describe('general', () => {
            beforeEach(() => Test.save({test: true}, {test: false}, {test2: 'test2'}))
            it('should support truthy $exists', async() =>
                expect(await Test.where({test: {$exists: true}})).to.have.length(2))
            it('should support falsy $exists', async() =>
                expect(await Test.where({test: {$exists: false}})).to.have.length(1)
                    .and.to.have.deep.property(`[0].test2`, 'test2'))
        })
        describe('arrays', () => {
            beforeEach(async() => await Test.save(
                {test: [1, 2, 3, 4, 5], test2: 1},
                {test: [6, 7, 8, 9, 0], test2: 2}))


            it('should support $has', async() =>
                expect(await Test.where({test: {$has: 1}})).to.have.length(1)
                    .and.to.have.deep.property(`[0].test2`, 1))
            it('should support multiple $has', async() =>
                expect(await Test.where({test: {$has: [1, 2]}})).to.have.length(1)
                    .and.to.have.deep.property(`[0].test2`, 1))
            it('should support $in', async() =>
                expect(await Test.where({test2: {$in: [1, 1, 1, 5, 5]}})).to.have.length(1)
                    .and.to.have.deep.property(`[0].test2`, 1))
            it('should support multiple $in', async() =>
                expect(await Test.where({test2: {$in: [[1, 1, 1, 5, 5], [1, 2, 2, 4, 4]]}})).to.have.length(1)
                    .and.to.have.deep.property(`[0].test2`, 1))
        })
    })

    describe('events', () => {
        it('should receive created event', (done) => {
            Test.on('created', (record) => {
                expect(record)
                    .to.deep.include({val: 1})
                done()
                done = () => {}
            })
            new Test({val: 1}).save()
        })
        it('should receive updated event', (done) => {
            Test.on('updated', (record) => {
                expect(record)
                    .to.deep.include({val: 2})
                done()
                done = () => {}
            })
            new Test({val: 1}).save().then(entry => entry.save({val: 2}))
        })
    })
})
