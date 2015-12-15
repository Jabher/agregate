import 'babel-polyfill'
import {expect} from 'chai'
import {CypherQuery} from '../lib/Cypher/index'

describe('Cypher Query lib', () => {
    it('should create query', () => {
        expect(CypherQuery.tag`test`.getRawQuery())
            .to.have.property('query').that.is.equal('test')
    })
    it('should create query with string param', () => {
        expect(CypherQuery.tag`test${'testVar'}`.getRawQuery())
            .to.deep.include({query: `test{${CypherQuery.defaultPrefix}0}`})
            .and.to.have.property('params')
            .that.is.deep.equal({[`${CypherQuery.defaultPrefix}0`]: 'testVar'})
    })
})