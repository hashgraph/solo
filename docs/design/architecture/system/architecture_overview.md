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
     * TBD
* Business Layer (Discrete Low Level "god" Functions)
  * 
  * Deployment Model
  * Runtime State
    * Introspected 
    * Computed
    * User Supplied Input
* Data Layer
  * Configuration
    * Local (User Specific)
    * Remote (Deployment Specific)
    * Environment
  * Generated Persisted State (Cache Folder)
    * Certificates and Keys
    * Rendered Helm Values
    * Templates
* Storage Backends
  * Local Filesystem
  * Kubernetes CM/Secrets
  * Environment Variables
* Integration Layer
  * Helm Client
  * Kubernetes Client

NOTE: Business logic currently resides in the CLI command framework.
