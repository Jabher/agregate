import 'babel-polyfill'
import {expect} from 'chai'
import {Record, query, connect} from '../lib/index'
connect('http://neo4j:password@localhost:7474')

class TestRecord extends Record {
    static namespace = 'test'
}

describe('ActiveRecord', () => {
    class Test extends TestRecord {}
    Test.register()
    beforeEach(async () =>
        await query(`MATCH (n) DETACH DELETE n`))
    after(async () =>
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
            get subjects() { return this.getRelation('relation') }
        }
        TestObject.register()
        class TestSubject extends TestRecord {
            get objects() { return this.getRelation('relation') }
        }
        TestSubject.register()
        let object, subject
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
            it('should successfully resolve subjects', async () =>
                expect(await object.subjects.entries()).to.has.length(1))
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
    })
})