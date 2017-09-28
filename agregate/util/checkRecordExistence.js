// @flow

import { BaseRecord } from '../record/BaseRecord'

export default function checkRecordExistence(node: BaseRecord): void {
  if (!node || !node.__isReflected) {
    throw new Error('cannot perform action for non-reflected record')
  }
}
