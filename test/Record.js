import 'babel-polyfill'
import {expect} from 'chai'
import {Record, GraphConnection, Relation} from '../lib/index'

const connection = new GraphConnection('http://neo4j:password@localhost:7474')
class TestRecord extends Record {
    static connection = connection
}
const query = connection.query.bind(connection)

describe('ActiveRecord', () => {
    class Test extends TestRecord {}
    before(() => {
        Test.register()
    })
    beforeEach(async () =>
        await query(`MATCH (n) DETACH DELETE n`))

    describe('classes', () => {
        let instance
        const opts = {id: 1}
        beforeEach(async () =>
            await (instance = new Test(opts)).save())

        it('should create new record', async () =>
            expect(await Test.byUuid(instance.uuid))
                .to.deep.include(opts))
        it('should destroy existing record', async () => {
            await instance.destroy()
            return expect(await Test.byUuid(instance.uuid)).to.equal.undefined
        })
    })
    describe('props', () => {
        let instance
        const testString = 'testString'
        const testDate = Date.now()
        const testNumber = Math.floor(Math.random() * 1000000) + 1
        const opts = {id: 1, testString, testDate, testNumber}

        beforeEach(async () =>
            await (instance = new Test(opts)).save())

        it('should create new record with props', async () =>
            expect(await Test.byUuid(instance.uuid))
                .to.deep.include(opts))
        it('should save updated props', async () => {
            instance.testNumber = testNumber * 2
            await instance.save()
            expect(await Test.byUuid(instance.uuid))
                .to.deep.include({...instance})
        })
    })

    describe('relations', () => {
        class TestObject extends TestRecord {
            constructor(...args) {
                super(...args)
                this.defineRelations({
                    subjects: ['relation']
                })
            }
        }
        class TestSubject extends TestRecord {
            constructor(...args) {
                super(...args)
                this.defineRelations({
                    subjects: ['relation'],
                    objects: ['relation', {direction: -1}]
                })
            }
        }
        let object
        let subject
        before(() => {
            TestObject.register()
            TestSubject.register()
        })
        beforeEach(async () => {
            await (object = new TestObject()).save()
            await (subject = new TestSubject()).save()
        })

        describe('prequisitions', () => {
            it('should be empty', async () =>
                expect([...await object.subjects.entries()]).to.be.empty)
            it('should have size 0', async () =>
                expect(await object.subjects.size()).to.be.equal(0))
        })
        describe('manipulations', () => {
            beforeEach(async () =>
                await object.subjects.add(subject))

            it('should successfully resolve subjects', async () =>
                expect(await object.subjects.size()).to.be.equal(1))
            it('should successfully resolve subjects using Relation#entries', async () =>
                expect(await object.subjects.entries()).to.has.length(1))
            it('should contain reverse relations using Relation#entries', async () =>
                expect(await subject.objects.entries()).to.has.length(1))
            it('should contain shared namespace but different direction relations using Relation#entries', async () =>
                expect(await subject.subjects.entries()).to.has.length(0))
            it('should resolve objects of subject', async () =>
                expect(await subject.objects.entries()).to.has.length(1))
            it('should successfully delete subjects using Relation#delete', async () => {
                const [entry] = await object.subjects.entries()
                await object.subjects.delete(entry)
                expect(await object.subjects.size()).to.be.equal(0)
            })
            it('should successfully delete subjects using Relation#clear', async () => {
                await object.subjects.clear()
                expect(await object.subjects.size()).to.be.equal(0)
            })
        })
        describe('deep', () => {
            class TestSourceObject extends TestRecord {
                constructor(...args) {
                    super(...args)
                    const intermediateRelation =
                        new Relation(this, 'rel1', {target: TestIntermediateObject})
                    this.defineRelations({
                        intermediateObjects: intermediateRelation,
                        endObjects: new Relation(intermediateRelation, 'rel2', {target: TestEndObject})
                    })
                }
            }
            class TestIntermediateObject extends TestRecord {
                constructor(...args) {
                    super(...args)
                    this.defineRelations({
                        endObjects: new Relation(this, 'rel2', {target: TestEndObject})
                    })
                }
            }
            class TestEndObject extends TestRecord {}

            let startObject
            let midObject
            let endObject
            before(() => {
                TestSourceObject.register()
                TestIntermediateObject.register()
                TestEndObject.register()
            })

            beforeEach(async () => {
                await (startObject = new TestSourceObject()).save()
                await (midObject = new TestIntermediateObject()).save()
                await (endObject = new TestEndObject()).save()

                // spoofing for tests whether they are not captured by accident

                new TestSourceObject().save()
                new TestIntermediateObject().save()
                new TestEndObject().save()
            })
            describe('prequisitions', () => {
                it('should be empty by default using Relation#size', async () =>
                    expect(await startObject.endObjects.size()).to.equal(0))
                it('should be empty by default using Relation#entries', async () =>
                    expect(await startObject.endObjects.entries()).to.have.length(0))
            })
            describe('manipulations', () => {
                beforeEach(async () => {
                    await startObject.intermediateObjects.add(midObject)
                    await midObject.endObjects.add(endObject)
                })
                it('should contain 1 item using Relation#size', async () =>
                    expect(await startObject.endObjects.size()).to.equal(1))
                it('should contain 1 item using Relation#entries', async () =>
                    expect(await startObject.endObjects.entries()).to.have.length(1))
                it('should contain endItem', async () =>
                    expect(await startObject.endObjects.entries()).to.have.deep.property('[0].uuid', endObject.uuid))
                it('should remove the item using Relation#clear', async () => {
                    await startObject.endObjects.clear()
                    expect(await startObject.endObjects.size()).to.equal(0)
                })
                it('should remove the item using Relation#delete', async () => {
                    await startObject.endObjects.delete(endObject)
                    expect(await startObject.endObjects.size()).to.equal(0)
                })
            })
        })
    })
    describe('self-relations', () => {
        class TestSelfObject extends TestRecord {
            constructor(...args) {
                super(...args)
                this.defineRelations({
                    subjects: ['ref']
                })
            }
        }
        let object1
        let object2
        before(() => {
            TestSelfObject.register()
        })
        beforeEach(async () => {
            await (object1 = new TestSelfObject()).save()
            await (object2 = new TestSelfObject()).save()
        })
        it('should not have item by default', async () => {
            expect({
                forward: await object1.subjects.has(object2),
                reverse: await object2.subjects.has(object1),
            }).to.deep.equal({
                forward: false,
                reverse: false,
            })
        })

        it('should contain item', async () => {
            await object1.subjects.add(object2)
            expect({
                forward: await object1.subjects.has(object2),
                reverse: await object2.subjects.has(object1),
            }).to.deep.equal({
                forward: true,
                reverse: false,
            })
        })

        it('should deeply contain item', async () => {
            const object3 = await new TestSelfObject().save()
            await object1.subjects.add(object2)
            await object2.subjects.add(object3)
            expect({
                forward: await object1.subjects.has(object3),
                reverse: await object2.subjects.has(object1),
            }).to.deep.equal({
                forward: false,
                reverse: false,
            })
        })
    })

    describe('querying', () => {
        const test = 'test'
        let items
        beforeEach(async () =>
            items = await Promise.all(function*() {
                let idx = 0
                do yield new Test({idx, test}).save()
                while (idx++ < 5)
            }()))

        it('should reveal item by string prop', async () =>
            expect(await Test.where({test})).to.have.length(items.length))
        it('should reveal item by int prop', async () =>
            expect(await Test.where({idx: items[0].idx})).to.deep.include(items[0]))
        it('should support offset', async () => {
            const limit = 2
            const result = await Test.where({test}, {limit: 2, order: 'idx ASC'})
            expect(result).to.have.length(limit)
            expect(result.map(res => res.idx)).to.deep.equal([0, 1])
        })
        it('should support limit', async () => {
            const limit = 2
            const result = await Test.where({test}, {limit: 2, offset: 1, order: 'idx ASC'})
            expect(result).to.have.length(limit)
            expect(result.map(res => res.idx)).to.deep.equal([1, 2])
        })
    })
})
