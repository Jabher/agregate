import { Record } from "../record";
import { Relation } from "./index";
import { Connection } from "../connection";
import { Cypher } from "../cypher";
import chai, { expect } from "chai";
import spies from "chai-spies";
chai.use(spies);

class Test extends Record {
  static connection = new Connection('localhost', { username: 'neo4j', password: 'password' });
}

describe('Agregate Relation', () => {
  before(async () =>
    await Test.register())

  beforeEach(async () =>
    await Test.connection.query(Cypher.tag`MATCH (n) DETACH DELETE n`))


  describe('relations', () => {
    class TestObject extends Test {
      subjects = new Relation(this, 'relation');
    }
    class TestSubject extends Test {
      subjects = new Relation(this, 'relation');
      objects = new Relation(this, 'relation', { direction: -1 });
    }
    let object
    let subject
    before(async () => {
      await TestObject.register()
      await TestSubject.register()
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
    describe('promise-management', () => {
      it('should support promise entry sources', async () => {
        await object.subjects.add(await TestSubject.where({ uuid: subject.uuid }))
        expect(await object.subjects.size()).to.be.equal(1)
      })
    })
    describe('querying', () => {
      it('should support empty $relation queries', async () => {
        expect(await TestSubject.where({$relations: [
          object.subjects
        ]})).to.have.length(0)
      })
      it('should support $relation queries', async () => {
        await object.subjects.add(await TestSubject.where({ uuid: subject.uuid }))
        expect(await TestSubject.where({$relations: [
          object.subjects
        ]})).to.have.length(1)
      })
      it('should support shorthand syntax', async () => {
        await object.subjects.add(await TestSubject.where({ uuid: subject.uuid }))
        expect(await TestSubject.where([object.subjects])).to.have.length(1)
      })
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
      it('should resolve objects of subject by props', async () =>
        expect(await subject.objects.where({ uuid: object.uuid })).to.have.length(1))
      it('should not resolve objects not of subject by props', async () =>
        expect(await subject.objects.where({ uuid: (await new TestObject().save()).uuid })).to.has.length(0))
      it('should resolve intersect objects using Relation#intersect', async () =>
        expect(await subject.objects.intersect(
          object,
          await new TestObject().save()
        )).to.have.length(1))
      it('should resolve objects of subject by #has', async () =>
        expect(await subject.objects.has(await TestObject.where())).to.be.equal(true))
      it('should not resolve wrong objects by #has', async () =>
        expect(await subject.objects.has(await TestSubject.where())).to.be.equal(false))
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
      class TestSourceObject extends Test {
        intermediateObjects = new Relation(this, 'rel1', { target: TestIntermediateObject });
        endObjects = new Relation(this.intermediateObjects, 'rel2', { target: TestEndObject });
      }
      class TestIntermediateObject extends Test {
        endObjects = new Relation(this, 'rel2', { target: TestEndObject });
      }
      class TestEndObject extends Test {
      }

      let startObject
      let midObject
      let endObject
      before(async () => {
        await TestSourceObject.register()
        await TestIntermediateObject.register()
        await TestEndObject.register()
      })

      beforeEach(async () => {
        await (startObject = new TestSourceObject()).save()
        await (midObject = new TestIntermediateObject()).save()
        await (endObject = new TestEndObject()).save()

        // spoofing for tests whether they are not captured by accident

        await new TestSourceObject().save()
        await new TestIntermediateObject().save()
        await new TestEndObject().save()
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
    describe('one-to-one', () => {
      beforeEach(async () =>
        await object.subjects.only(subject))

      it('should have a relation', async () =>
        expect(await object.subjects.entries()).to.have.length(1))
      it('should remove a relation', async () => {
        await object.subjects.only(null)
        expect(await object.subjects.entries()).to.have.length(0)
      })
      it('should resolve a relation', async () =>
        expect(await object.subjects.only()).to.deep.include({ uuid: subject.uuid }))
    })
  })
  describe('self-relations', () => {
    class TestSelfObject extends Test {
      subjects = new Relation(this, 'ref');
    }
    let object1
    let object2
    before(async () => {
      await TestSelfObject.register()
    })
    beforeEach(async () => {
      await (object1 = new TestSelfObject()).save()
      await (object2 = new TestSelfObject()).save()
    })
    it('should not have item by default', async () => {
      expect({
        forward: await object1.subjects.has(object2),
        reverse: await object2.subjects.has(object1)
      }).to.deep.equal({
        forward: false,
        reverse: false
      })
    })

    it('should contain item', async () => {
      await object1.subjects.add(object2)
      expect({
        forward: await object1.subjects.has(object2),
        reverse: await object2.subjects.has(object1)
      }).to.deep.equal({
        forward: true,
        reverse: false
      })
    })

    it('should deeply contain item', async () => {
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
})
