# Data Layer Architecture

Solo internally maintains several critical path data models which support various features. 
As of the v0.35 release train of Solo, these models are not clearly defined and documented. These 
models are also intermingled in public/private API implementations, user input/output 
implementations, business logic implementations, runtime introspection implementations, and other 
such areas.

The goal of this document is to present a clear and concise definition of the internal data models
and propose a plan to refactor the codebase to separate these models from the rest of the codebase.

[todo]: <> (Move the problem statement and areas for improvement to the technical design doc)
## Problem Statement

The current state of the Solo codebase is such that the internal data models are not clearly defined
and documented. This leads to several issues:

1. **Code Duplication**: The same data model is defined in multiple places in the codebase.
2. **Inconsistency**: The same data model is defined differently in different places in the codebase.
3. **Complexity**: The codebase is difficult to understand and maintain due to the lack of clear data models.
4. **Scalability**: The codebase is not scalable due to the lack of clear data models.
5. **Extensibility**: The codebase is not extensible due to the lack of clear data models.
6. **Testability**: The codebase is not easily testable due to the lack of clear data models.
7. **Readability**: The codebase is not readable due to the lack of clear data models.

## Areas for Improvement

1. Clear and concise definition of the internal data models.
2. Separation of the internal data models from the rest of the codebase.
3. Distinction between types of internal data.
4. Documentation of the internal data models.
5. Separation of data objects used to read/write configuration from business objects used to represent the state of the system.
6. Separation of internal objects model and persistence. 
7. Schema Migration support (currently missing).

## Configuration

### Standards

Solo uses a hierarchical configuration system to manage configuration values. Configuration values can
be set in multiple places, and Solo follows a specific order of precedence to determine the effective
value. Configuration values can be set in the following places:

* Default Values (constants)
* Environment Variables 
* Local Configuration File
* Remote Configuration File (Deployment Specific)

The configuration values must be addressable using a hierarchical key syntax. Solo follows the 
Eclipse MicroProfile Config Specification for the key syntax. 

All implementations should adhere to the following requirements:

* Configuration keys must be case-insensitive.
* Configuration keys must be hierarchical.
* Configuration keys must be addressable using a hierarchical key syntax with each level separated by a period (`.`).
* Configuration keys are defined as either a root, intermediate, or leaf node in the hierarchy.
* Leaf nodes must not have children and must have a directly assigned primitive value.
  * In this context, a primitive value is a value that is not an object, map, or array.
  * Primitive values may be nullable.
* Intermediate nodes must have children and may be represented as objects in the configuration system.
  * Intermediate nodes must have a single parent.
* Root nodes are the top-level nodes in the hierarchy and must have children.
  * Root nodes must not have a parent.
* Support for multiple file formats (e.g., YAML, JSON) is permitted but not required.
* Support for environment variables is required.
* Support for default values is required.

For example, the key `deployment.network.realm` represents a hierarchical structure with three 
levels: `deployment`, `network`, and `realm`. The `realm` key has no children and has a directly 
assigned value, so it is a leaf node in the hierarchy. The `network` key has children and a parent, 
so it is an intermediate node in the hierarchy. The `deployment` key has children but no parent, so
it is a root node in the hierarchy.

See the [Eclipse MicroProfile Config Specification](https://download.eclipse.org/microprofile/microprofile-config-3.1/microprofile-config-spec-3.1.html#_rationale) 
for additional details and rationale.

#### Configuration Format Examples

##### YAML
```yaml
deployment:
  network:
    realm: 3
```

##### JSON
```json
{
  "deployment": {
    "network": {
      "realm": 3
    }
  }
}
```

##### Environment Variable
```bash
export SOLO_DEPLOYMENT_NETWORK_REALM=1
```

##### Default Value
```typescript
export class DeploymentConfig {
  public static readonly DEFAULT_NETWORK_REALM: number = 0;
}
```

### Order of Precedence

A given configuration value can be set in multiple places. When a configuration value is set in 
multiple places, Solo will follow a specific order of precedence to determine the effective value.
Configuration sources with a higher precedence will override configuration sources with a lower 
precedence. Complex configuration values (e.g., objects, arrays) will NOT be merged together and
the higher precedence value will completely replace the lower precedence value.

The order of precedence for configuration values is as follows (from lowest to highest):

1. Default Values (constants)
2. Environment Variables
3. Local Configuration File
4. Remote Configuration File (Deployment Specific)

#### Precedence Example

Consider the following examples for the `deployment.network.realm` defined as a `long integer` configuration value:

##### Case 1

1. Default Value: `0`
2. Environment Variable: `1`
3. Local Configuration File: `2`
4. Remote Configuration File: `3`

In this case, the effective value of `deployment.network.realm` will be `3`.

##### Case 2

1. Default Value: `0`
2. Environment Variable: `1`
3. Local Configuration File: `2`
4. Remote Configuration File: Not Set

In this case, the effective value of `deployment.network.realm` will be `2`.

##### Case 3

1. Default Value: `0`
2. Environment Variable: `1`
3. Local Configuration File: Not Set
4. Remote Configuration File: `3`

In this case, the effective value of `deployment.network.realm` will be `3`.

##### Case 4

1. Default Value: `0`
2. Environment Variable: `1`
3. Local Configuration File: Not Set
4. Remote Configuration File: Not Set

In this case, the effective value of `deployment.network.realm` will be `1`.

#### Case 5

1. Default Value: `0`
2. Environment Variable: Not Set
3. Local Configuration File: Not Set
4. Remote Configuration File: Not Set

In this case, the effective value of `deployment.network.realm` will be `0`.



