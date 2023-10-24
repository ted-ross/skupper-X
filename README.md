# Skupper-X

A multi-tenant Virtual Application Network solution that controls both the *network topology* and the *application topology* of distributed software systems.

_This is a research platform.  It is being used to do rapid-prototyping of some new ideas around distributed application definition, deployment, and lifecycle._

Features:

* Time-boxed, invitation-based participation in a VAN
* VAN-owners do not need to consider the topology of the router of networks, only which sites participate
* Centralized management, monitoring, and audit of all of the VANs in the installation
* Supports DMZ-deployed routers
* Git-ops support for deploying and managing a VAN
* Site-scoped addressing for multiple workload instances so individual sites can be independently addressed
* Integration with the customer's PKI system
* Automatic and seamless rotation of x.509 certificates
* Forcible removal of an entire VAN as one operation
* Forcible removal of a site/participant from the VAN

# Demo Scenarios

## Customer Prem Software

### Sequence

1. User creates a new Application Network
1. User generates an invitation for the headquarters site
1. HQ invitation is invoked on a namespace
1. User creates a site class for "gold"
1. User creates an invitation for "customer-A" for site-class "gold"
1. Customer-A invokes the invitation in their namespace
1. User observes the joining of HQ and customer-A in the application network console
1. User composes an application with HQ and customer-prem container images and interconnect dependencies
1. User allocates components of the application to HQ and to "gold"
1. Customer-A opens the site console and sees the list of changes the application wants to make locally
1. Customer-A accepts all changes
1. Customer-A observes the deployment of artifacts locally
1. Repeat for Customer-B
1. Customer-B declines the deployment of one component (the customer monitoring image)
1. User observes that no ingress is created at HQ for Customer-B monitoring

## Retail Chain

1. Use git-ops to deploy an application across the enterprise.
1. Onboard a new retail location via site class and watch it automatically deploy.
1. Observe ingress-per-location in the headquarters site (site-scoped addresses).
1. Perform a trial upgrade of the application on one site, then continue to all sites overnight.

## Hands-on software training in distance learning

1. Invite all students to the collaboration.
1. Provide a partially complete distributed application involving student sites and the professor's site.
1. Allow students to develop components that interact with the distributed application.
1. Tear it all down at the end of the session.
