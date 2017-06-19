// @flow

import type { ILabelCollectionReference } from "../types"
import { Collection } from "../base/Collection"

export class LabelCollection extends Collection
  implements ILabelCollectionReference {
  static get label() {
    return this.name
  }

  get label(): string {
    return this.constructor.label
  }

  async register(connection: ICollectionReference) {}
  // reflectedState: IReflection<INode>;

  unique: ?(string[])
  uniqueMulti: ?(string[][])
  indexed: ?(string[])
  exists: ?(string[])

  constructor() {
    super()
    this._constraints.push({ type: "label", label: this.label })
  }
}
