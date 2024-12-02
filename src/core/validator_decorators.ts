/**
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the ""License"");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an ""AS IS"" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import { registerDecorator, type ValidationOptions, type ValidationArguments } from 'class-validator'

const isObject = (obj) => obj === Object(obj)

export const IsDeployments = (validationOptions?: ValidationOptions) => {
    return function (object: any, propertyName: string) {
        registerDecorator({
            name: 'IsDeployments',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [],
            options: {
                ...validationOptions,
            },
            validator: {
                validate (value: any, args: ValidationArguments) {
                    if (!isObject(value)) return false
                    if (Object.keys(value).length === 0) return true

                    const keys = Object.keys(value)

                    return keys.every(key => {
                        if (typeof key !== 'string') return false
                        if (!isObject(value[key])) return false
                        if (!Array.isArray(value[key].clusterAliases)) return false
                        if (!value[key].clusterAliases.every(val => typeof val === 'string')) return false

                        return true
                    })
                },
            },
        })
    }
}