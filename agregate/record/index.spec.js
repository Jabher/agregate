import { Record } from "./index";
import { Connection } from "../connection";
import { Cypher } from "../cypher";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);

class Test extends Record {
  static connection = new Connection('localhost', { username: 'neo4j', password: 'password' });

  static async save(...props) {
    return await Promise.all(props.map(opts => new this(opts).save()))
  }
}

const cleanBeforeEach = () =>
  beforeEach(async () =>
    await Test.connection.query(Cypher.tag`MATCH (n) DETACH DELETE n`))

describe('Agregate Record', () => {
  before(async () =>
    await Test.register())

  cleanBeforeEach();

  describe('classes', () => {
    let instance;
    const opts = { id: 1 };

    cleanBeforeEach();
    beforeEach(async () =>
      await (instance = new Test(opts)).save());

    it('should create new record', async () =>
      expect(await Test.byUuid(instance.uuid))
        .to.deep.include(opts))
    it('should create new record by Record#firstOrInitialize', async () =>
      expect(await Test.firstOrInitialize(opts))
        .to.deep.include(opts))
    it('should return existing record if exists by Record#firstOrInitialize', async () =>
      expect(await Test.firstOrInitialize(opts))
        .to.deep.include({ uuid: instance.uuid }))
    it('should destroy existing record', async () => {
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
    const opts = { id: 1, testString, testDate, testNumber }
    cleanBeforeEach();
    beforeEach(async () =>
      await (instance = new Test(opts)).save())

    it('should create new record with props', async () =>
      expect(await Test.byUuid(instance.uuid))
        .to.deep.include(opts))
    it('should save updated props', async () => {
      instance.testNumber = testNumber * 2
      await instance.save()
      expect(await Test.byUuid(instance.uuid))
        .to.deep.include({ ...instance })
    })
  })
  describe('querying', () => {
    const test = 'test'
    let items
    cleanBeforeEach();
    beforeEach(async () =>
      items = await Promise.all(function* () {
        let idx = 0
        do {yield new Test({ idx, test }).save()}
        while (idx++ < 5)
      }()))

    describe('basics', () => {
      it('should reveal item by string prop', async () =>
        expect(await Test.where({ test })).to.have.length(items.length))
      it('should reveal item by int prop', async () =>
        expect(await Test.where({ idx: items[0].idx }))
          .to.have.deep.property('[0]')
          .that.deep.includes(items[0]))
      it('should support reverse order', async () => {
        const limit = 2
        const result = await Test.where({ test }, { limit: 2, order: 'idx DESC' })
        expect(result).to.have.length(limit)
        expect(result.map(res => res.idx)).to.deep.equal([5, 4])
      })
      it('should support offset', async () => {
        const limit = 2
        const result = await Test.where({ test }, { limit: 2, order: 'idx ASC' })
        expect(result).to.have.length(limit)
        expect(result.map(res => res.idx)).to.deep.equal([0, 1])
      })
      it('should support limit', async () => {
        const limit = 2
        const result = await Test.where({ test }, { limit: 2, offset: 1, order: 'idx ASC' })
        expect(result).to.have.length(limit)
        expect(result.map(res => res.idx)).to.deep.equal([1, 2])
      })
    })
    describe('numbers', () => {
      cleanBeforeEach();
      beforeEach(() => Test.save({ test: 1 }, { test: 2 }, { test: 3 }))

      it('should support $lt', async () =>
        expect(await Test.where({ test: { $lt: 2 } }), { order: 'test' }).to.have.length(1)
          .and.to.have.deep.property('[0].test', 1))
      it('should support $lte', async () =>
        expect(await Test.where({ test: { $lte: 2 } }, { order: 'test' })).to.have.length(2)
          .and.to.have.deep.property('[1].test', 2))
      it('should support $gt', async () =>
        expect(await Test.where({ test: { $gt: 2 } }), { order: 'test' }).to.have.length(1)
          .and.to.have.deep.property('[0].test', 3))
      it('should support $gte', async () =>
        expect(await Test.where({ test: { $gte: 2 } }, { order: 'test' })).to.have.length(2)
          .and.to.have.deep.property('[0].test', 2))

      it('should support multiple $lt', async () =>
        expect(await Test.where({ test: { $lt: [2, 3] } }), { order: 'test' }).to.have.length(1)
          .and.to.have.deep.property('[0].test', 1))
      it('should support multiple $lte', async () =>
        expect(await Test.where({ test: { $lte: [2, 3] } }, { order: 'test' })).to.have.length(2)
          .and.to.have.deep.property('[1].test', 2))
      it('should support multiple $gt', async () =>
        expect(await Test.where({ test: { $gt: [2, 1] } }), { order: 'test' }).to.have.length(1)
          .and.to.have.deep.property('[0].test', 3))
      it('should support multiple $gte', async () =>
        expect(await Test.where({ test: { $gte: [2, 1] } }, { order: 'test' })).to.have.length(2)
          .and.to.have.deep.property('[0].test', 2))

    })
    describe('strings', () => {
      cleanBeforeEach();
      beforeEach(() => Test.save({ test: 'abcde' }, { test: 'ecdba' }, { test: 'foo' }))
      it('should support $startsWith', async () =>
        expect(await Test.where({ test: { $startsWith: 'abc' } })).to.have.length(1)
          .and.to.have.deep.property('[0].test', 'abcde'))
      it('should support $endsWith', async () =>
        expect(await Test.where({ test: { $endsWith: 'cde' } })).to.have.length(1)
          .and.to.have.deep.property('[0].test', 'abcde'))
      it('should support $contains', async () =>
        expect(await Test.where({ test: { $contains: 'a' } })).to.have.length(2))

      it('should support multiple $startsWith', async () =>
        expect(await Test.where({ test: { $startsWith: ['abc', 'ab'] } })).to.have.length(1)
          .and.to.have.deep.property('[0].test', 'abcde'))
      it('should support multiple $endsWith', async () =>
        expect(await Test.where({ test: { $endsWith: ['cde', 'de'] } })).to.have.length(1)
          .and.to.have.deep.property('[0].test', 'abcde'))
      it('should support multiple $contains', async () =>
        expect(await Test.where({ test: { $contains: ['a', 'b'] } })).to.have.length(2))
    })
    describe('general', () => {
      cleanBeforeEach();
      beforeEach(() => Test.save({ test: true }, { test: false }, { test2: 'test2' }))
      it('should support truthy $exists', async () =>
        expect(await Test.where({ test: { $exists: true } })).to.have.length(2))
      it('should support falsy $exists', async () =>
        expect(await Test.where({ test: { $exists: false } })).to.have.length(1)
          .and.to.have.deep.property('[0].test2', 'test2'))
    })
    describe('arrays', () => {
      cleanBeforeEach();
      beforeEach(async () => await Test.save(
        { test: [1, 2, 3, 4, 5], test2: 1 },
        { test: [6, 7, 8, 9, 0], test2: 2 }))


      it('should support $has', async () =>
        expect(await Test.where({ test: { $has: 1 } })).to.have.length(1)
          .and.to.have.deep.property('[0].test2', 1))
      it('should support multiple $has', async () =>
        expect(await Test.where({ test: { $has: [1, 2] } })).to.have.length(1)
          .and.to.have.deep.property('[0].test2', 1))
      it('should support $in', async () =>
        expect(await Test.where({ test2: { $in: [1, 1, 1, 5, 5] } })).to.have.length(1)
          .and.to.have.deep.property('[0].test2', 1))
      it('should support multiple $in', async () =>
        expect(await Test.where({ test2: { $in: [[1, 1, 1, 5, 5], [1, 2, 2, 4, 4]] } })).to.have.length(1)
          .and.to.have.deep.property('[0].test2', 1))
    });
    describe('ORs', () => {
      cleanBeforeEach();

      beforeEach(async () => await Test.save(
        { test1: 1, test2: 1 },
        { test1: 2, test2: 2 },
        { test1: 3, test2: 3 }
      ));


      it('should match same case', async () =>
        expect(await Test.where([{ test1: 2 }, { test2: 2 }])).to.have.length(1)
          .and.to.have.deep.property('[0].test2', 2));
      it('should match different cases', async () =>
        expect(await Test.where([{ test1: 1 }, { test2: 2 }])).to.have.length(2));
    })
  });

  describe('hooks', () => {
    let testRecord
    beforeEach(() =>
      testRecord = new Test())

    it('should process create hooks', async () => {
      testRecord.beforeCreate = chai.spy(() =>
        expect(testRecord.afterCreate).to.be.not.called())
      testRecord.afterCreate = chai.spy(() =>
        expect(testRecord.beforeCreate).to.be.called())
      await testRecord.save();
      expect(testRecord.beforeCreate, 'before hook').to.be.called.once()
      expect(testRecord.afterCreate, 'after hook').to.be.called.once()
    })

    it('should contain metadata in afterCreate hook', async () => {
      testRecord.afterCreate = chai.spy(function () {
        expect(this.uuid).to.not.equal(undefined)
      })
      await testRecord.save()
    })

    it('should process update hooks', async () => {
      await testRecord.save()
      testRecord.beforeUpdate = chai.spy(() =>
        expect(testRecord.afterUpdate).to.be.not.called())
      testRecord.afterUpdate = chai.spy(() =>
        expect(testRecord.beforeUpdate).to.be.called())
      await testRecord.save()
      expect(testRecord.beforeUpdate, 'before hook').to.be.called.once()
      expect(testRecord.afterUpdate, 'after hook').to.be.called.once()
    })
    it('should process destroy hooks', async () => {
      await testRecord.save()
      testRecord.beforeDestroy = chai.spy(() =>
        expect(testRecord.afterDestroy).to.be.not.called())
      testRecord.afterDestroy = chai.spy(() =>
        expect(testRecord.beforeDestroy).to.be.called())
      await testRecord.destroy()
      expect(testRecord.beforeDestroy, 'before hook').to.be.called.once()
      expect(testRecord.afterDestroy, 'after hook').to.be.called.once()
    })

    it('should support transactions', async () => {
      Object.assign(testRecord, {
        async beforeCreate() {
          expect(await Test.where({ state: 1 }, this.connection)).to.have.length(0)
        },
        async afterCreate() {
          expect(await Test.where({ state: 1 }, this.connection)).to.have.length(1)
        },
        state: 1
      })
      expect(await Test.where({ state: 1 })).to.have.length(0)
      await testRecord.save()
      expect(await Test.where({ state: 1 })).to.have.length(1)
    })
    it('should be affected by modifications in before hook', async () => {
      Object.assign(testRecord, {
        async beforeCreate() { this.state = 2 },
        state: 1
      })
      await testRecord.save()
      expect(await Test.where({ state: 2 })).to.have.length(1)
    })
  })
})
