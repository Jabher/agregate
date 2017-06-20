// @flow


import type { ICollectionReference, IWhereClause } from "../../types";
// | { type: "label", label: string }
// | {
//   type: "relation",
//     other: ICollectionReference,
//     direction: number,
//     label: ?string,
//     clause: ?IWhereClause
// }
// | { type: "where", clause: IWhereClause }

class Constraint {
  type: string;
}

export class LabelConstraint extends Constraint {
  type = "label";
  label: string;

  constructor(label: string) {
    super();
    this.label = label;
  }
}

export class RelationConstraint extends Constraint {
  type = "relation";
  other: ICollectionReference;
  direction: number;
  label: ?string;
  clause: ?IWhereClause;

  constructor(other: ICollectionReference, direction: number, label: ?string, clause: ?IWhereClause) {
    super();
    this.other = other;
    this.direction = direction;
    this.label = label;
    this.clause = clause;
  }
}

export class WhereConstraint extends Constraint {
  type = "where";

  clause: IWhereClause;

  constructor(clause: IWhereClause) {
    super();
    this.clause = clause;
  }
}