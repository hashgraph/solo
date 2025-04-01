// SPDX-License-Identifier: Apache-2.0

import {registerDecorator, type ValidationOptions, type ValidationArguments} from 'class-validator';

const isObject = object => object === Object(object);

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
        validate(value: any, arguments_: ValidationArguments) {
          if (!isObject(value)) {
            return false;
          }
          if (Object.keys(value).length === 0) {
            return true;
          }

          const keys = Object.keys(value);
          return keys.every(key => {
            if (typeof key !== 'string') {
              return false;
            }
            if (!isObject(value[key])) {
              return false;
            }
            if (!Array.isArray(value[key].clusters)) {
              return false;
            }
            if (!value[key].namespace || typeof value[key].namespace !== 'string' || !value[key].namespace.length) {
              return false;
            }
            if (!value[key].clusters.every(value_ => typeof value_ === 'string')) {
              return false;
            }
            return true;
          });
        },
      },
    });
  };
};

export const IsClusterReferences = (validationOptions?: ValidationOptions) => {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'IsClusterRefs',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: {
        ...validationOptions,
      },
      validator: {
        validate(value: any, arguments_: ValidationArguments) {
          if (!isObject(value)) {
            return false;
          }
          if (Object.keys(value).length === 0) {
            return true;
          }

          // TODO expand the validation. Check if the context exists in the local kube config
          //  and that it can actually establish a connection to the cluster
          for (const clusterName in value) {
            const contextName = value[clusterName];
            if (typeof clusterName !== 'string' || typeof contextName !== 'string') {
              return false;
            }
          }
          return true;
        },
      },
    });
  };
};
