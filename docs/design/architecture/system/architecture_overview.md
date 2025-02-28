# Architecture Overview


## N-Tier Design

* Presentation Layer
  * CLI Application 
    * Prompted User Inputs
    * Command Line Arguments
  * RESTful API Server
    * HTTP Request Payloads and Query Strings
  * GitHub Actions
  * Electron UI Application
* Workflow Layer
  * Facade Pattern for Underlying Workflow Engines 
     * Listr2
     * Headless
* Business Layer (Discrete Low Level "god" Functions)
  * Deployment Model
    * Data Objects
    * Requirements API
    * Components API 
      * Rules
      * Templates
  * Deployment Migration
  * Ledger Model
    * Data Objects
    * Client SDK Facade
  * Ledger Migration
  * Credential Management
    * Key Material
    * Secure Storage
  * External Dependency Management
    * Helm Installation
    * KinD Installation
    * Podman Installation
    * KinD Installation
  * General Utilities
    * Compression
    * Archive File Handling
    * HTTP/S File Downloads
  * Error Handling
    * Standardized Error Classes
  * Runtime State
    * Introspected 
    * Computed
    * User Supplied Input
* Data Layer
  * Schema Migration
  * Configuration
    * Local (User Specific)
    * Remote (Deployment Specific)
    * Environment
  * Generated Persisted State (Cache Folder)
    * Certificates and Keys
    * Rendered Helm Values
    * Templates
* Data Storage Layer
  * Local Filesystem
  * Kubernetes CM/Secrets
  * Environment Variables
* Integration Layer
  * KinD Client
  * Podman/Docker Client
  * Helm Client
  * K8 Client
  * Logging

NOTE: Business logic currently resides in the CLI command framework.

### N-Tier Design Diagram

![Design Diagram](https://lucid.app/publicSegments/view/e661b396-b9c5-41f2-90d8-c3bf77cd18e4/image.png)
