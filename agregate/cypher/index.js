// @flow
import R from "ramda";
import type { primitive } from "../types";


let session: Session;


const alphabet = "abcdefghiklmnopqrstvxyz".toLowerCase().split('');

export class Session {
  alphabet = alphabet

  objectNameMap: WeakMap<Object, string> = new WeakMap()
  nameMap: Map<any, string> = new Map()
  nameSeed = 0

  parameters = {}

  get(variable: any): string {
    const storage = variable instanceof Object ? this.objectNameMap : this.nameMap;

    const cachedName = storage.get(variable)
    if (cachedName) {
      return cachedName
    }

    const name = this.seedToString()
    storage.set(variable, name)
    this.parameters[name] = variable
    return name
  }


  seedToString(seed: number = this.nameSeed++) {
    const prefix = seed % this.alphabet.length
    const postfix = Math.floor(seed / this.alphabet.length) - 1

    return alphabet[prefix] + (postfix === -1 ? '' : postfix)
  }
}

class AbstractStatement {
  toJSON() {
    session = new Session()
    return {
      statement: cleanup(this.getRawQuery()),
      parameters: session.parameters
    }
  }

  getRawQuery(): string { return '' }
}

const serialize = R.ifElse(R.propIs(Function, 'getRawQuery'),
  v => v.getRawQuery(),
  v => `{${session.get(v)}}`)


const cleanup = R.pipe(
  R.split('\n'),
  R.map(R.trim),
  R.filter(R.complement(R.isEmpty)),
  R.join('\n'),
  R.replace(/\n+/gim, "\n")
)

class Raw extends AbstractStatement {
  statement: string

  constructor(...strings: string[]) {
    super()
    this.statement = strings.join('')
  }

  getRawQuery() { return this.statement }
}

export class Var extends AbstractStatement {
  getRawQuery() { return session.get(this) }
}

class Spread extends AbstractStatement {
  values: any[]

  constructor(values: any[]) {
    super()
    this.values = values
  }

  getRawQuery() { return this.values.map(serialize).join('') }
}

function interpolate(value: any): string {
  if (value instanceof Cypher) {
    return value.strings.map((string, i) => string + interpolate(value.values[i])).join('')
  } else if (value === undefined) {
    return ''
  } else {
    return String(value)
  }
}

export class Cypher extends AbstractStatement {
  static raw = (...args: any[]) => new Raw(...Array.isArray(args[0]) ? interpolate(Cypher.tag(...args)) : args)

  static tag = (strings: string[], ...values: primitive[]) => new Cypher(strings, values)

  static spread = (values: any[]) => new Spread(values)

  static literal = (object, keys = Object.keys(object)) =>
    new Cypher([...keys.map(key => `${key}:`), ""], keys.map(key => object[key]))

  strings: string[]
  values: primitive[]

  constructor(strings: string[], values: primitive[]) {
    super();
    this.strings = strings;
    this.values = values;
  }

  getRawQuery() {
    const [prefixString, ...strings] = this.strings

    return R.pipe(
      R.map(serialize),
      R.zip(strings),
      R.unnest,
      R.concat([prefixString]),
      R.join(''),
    )(this.values)
  }
}
