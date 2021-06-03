# Performance Comparison of Function-as-a-Service Triggers
## faas-trigger-study

### IMPORTANT: This repository contains the code used in the study and will not be updated.

![License](https://img.shields.io/badge/License-Apache-blue.svg)

A measurement tool for cross-platform Function-as-a-Service (FaaS) trigger performance evaluations.

Subscription or user-specific information must be added before deploying.

Before deploying the code Pulumi projects must be initiated for `/shared`, `/infra`, `/http`, `/storage`, and `/queue`.   

The project can then be deployed by first running `cd aws` or `cd azure` and then running either of the following three commands, depending on the desired trigger:
```
./deploy.sh -t http
./deploy.sh -t storage
./deploy.sh -t queue
```

### Authors
* Marcus Bertilsson
* Oskar Grönqvist
