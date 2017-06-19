// @flow
import type { IRecord } from "../types"

export default function checkRecordExistence(record: IRecord) {
  if (!record.__isReflected) {
    throw new Error("cannot perform action for non-reflected record")
  }
}
