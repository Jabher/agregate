// @flow
import type { DBPrimitive, Query } from "../types";

const getResults = (getKey, strings, values): Query[] =>
  values
    .map((value, index) =>
      (value && value.getRawQuery)
        ? value.getRawQuery(`${getKey(index)}_`)
        : { statement: `{${getKey(index)}}`, parameters: { [getKey(index)]: value } })
    .map(({ statement, parameters }, index) =>
      ({ statement: `${statement}${strings[index]}`, parameters }))

const cleanup = string =>
  string
    .replace(/^ +/img, '')
    .replace(/ +$/img, '')
    .replace(/\n+/img, '\n')
    .trim()


class Raw {
  string: string;

  constructor(string: string) { Object.assign(this, { string }) }

  toJSON() { return this.getRawQuery() }

  getRawQuery() { return { statement: this.string } }
}

export class Var {
  static sessionId: number;
  static nameMap: WeakMap<Var, string>;

  static resetSession() {
    this.nameMap = new WeakMap();
    this.sessionId = 0
  }

  get name(): string {
    const cachedValue = this.constructor.nameMap.get(this);
    if (cachedValue)
      return cachedValue;
    const name = 'v' + this.constructor.sessionId++;
    this.constructor.nameMap.set(this, name);
    return name;
  }

  getRawQuery() {
    return { statement: this.name };
  }
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

  constructor(strings: string[], values: DBPrimitive[]) { Object.assign(this, { strings, values }) }

  toJSON() {
    Var.resetSession();
    return this.getRawQuery()
  }

  getRawQuery(prefix: string = Cypher.defaultPrefix) {

    const [prefixString, ...strings] = this.strings;
    const results = getResults(index => `${prefix}${index}`, strings, this.values);
    return {
      statement: cleanup(results
        .map(({ statement }) => statement)
        .reduce((s, q) => s + q, prefixString)),
      parameters: Object.assign({}, ...results.map(({ parameters }) => parameters))
    }
  }
}
