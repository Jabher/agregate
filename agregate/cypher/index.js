// @flow
import type {DBPrimitive, Query} from '../types';

const getResults = (getKey, strings, values): Query[] =>
    values
        .map((value, index) =>
            (value instanceof Cypher || value instanceof Cypher.Raw)
                ? value.getRawQuery(`${getKey(index)}_`)
                : {statement: `{${getKey(index)}}`, parameters: {[getKey(index)]: value}})
        .map(({statement, parameters}, index) =>
            ({statement: `${statement}${strings[index]}`, parameters}))

const cleanup = string =>
    string
        .replace(/^ +/img, '')
        .replace(/ +$/img, '')
        .replace(/\n+/img, '\n')
        .trim()


class Raw {
    string: string;

    constructor(string: string) { Object.assign(this, {string}) }

    toJSON() { return this.getRawQuery() }

    getRawQuery() { return {statement: this.string} }
}

export class Cypher {
    static defaultPrefix = 'v'

    static Raw = Raw

    static raw = string => new Cypher.Raw(string)

    static tag = (strings: string[], ...values: DBPrimitive[]) => new Cypher(strings, values)

    static literal = (object, keys = Object.keys(object)) =>
        new Cypher([...keys.map(key => `${key}:`), ''], keys.map(key => object[key]))


    strings: string[];
    values: DBPrimitive[];

    constructor(strings: string[], values: DBPrimitive[]) { Object.assign(this, {strings, values}) }

    toJSON() { return this.getRawQuery() }

    getRawQuery(prefix: string = Cypher.defaultPrefix) {

        const [prefixString, ...strings] = this.strings;
        const results = getResults(index => `${prefix}${index}`, strings, this.values);
        return {
            statement: cleanup(results
                .map(({statement}) => statement)
                .reduce((s, q) => s + q, prefixString)),
            parameters: Object.assign({}, ...results.map(({parameters}) => parameters))
        }
    }
}
