// @flow
import type { ICollectionReference, IWhereClause  , IConstraint } from "../types"

export class Collection implements ICollectionReference {
  _constraints: IConstraint[]

  constructor(constraints: IConstraint[] = []) {
    this._constraints = constraints
  }

  _extend(...constraints: IConstraint[]) {
    return new Collection([...this._constraints, ...constraints])
  }

  where(clause: IWhereClause) {
    return this._extend({ type: "where", clause })
  }

  relates(
    other: ICollectionReference,
    relationLabel: ?string,
    relationWhereClause: ?IWhereClause = {}
  ) {
    return this._extend({
      type: "relation",
      other,
      label: relationLabel,
      clause: relationWhereClause,
      direction: 0
    })
  }

  relatesTo(
    other: ICollectionReference,
    relationLabel: ?string,
    relationWhereClause: ?IWhereClause
  ) {
    return this._extend({
      type: "relation",
      other,
      label: relationLabel,
      clause: relationWhereClause,
      direction: 1
    })
  }

  relatesFrom(
    other: ICollectionReference,
    relationLabel: ?string,
    relationWhereClause: ?IWhereClause
  ) {
    return this._extend({
      type: "relation",
      other,
      label: relationLabel,
      clause: relationWhereClause,
      direction: -1
    })
  }
}
