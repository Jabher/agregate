import 'babel-polyfill'
import {expect} from 'chai'
import {Cypher} from '../lib/Cypher/index'

describe('Cypher Query lib', () => {
    it('should create query', () => {
        expect(Cypher.tag`test`.getRawQuery())
            .to.have.property('query').that.is.equal('test')
    })
    it('should create query with string param', () => {
        expect(Cypher.tag`test${'testVar'}`.getRawQuery())
            .to.deep.include({query: `test{${Cypher.defaultPrefix}0}`})
            .and.to.have.property('params')
            .that.is.deep.equal({[`${Cypher.defaultPrefix}0`]: 'testVar'})
    })
    it('should create query with query param', () => {
        expect(Cypher.tag`test${Cypher.tag`${`testVar`}`}`.getRawQuery())
            .to.deep.include({query: `test{${Cypher.defaultPrefix}0_0}`})
            .and.to.have.property('params')
            .that.is.deep.equal({[`${Cypher.defaultPrefix}0_0`]: 'testVar'})
    })
})