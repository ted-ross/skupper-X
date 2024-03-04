# Bootstrap Deployment for Backbone Routers

Router bootstrapping is required when deploying a new backbone network which has no routers currently reachable from the management controller.

## Eligibility

A backbone router is eligible for bootstrap deployment when

1. It's TLS lifecycle is "ready", meaning it has an available TLS client certificate
1. It is configured with a "manage" access point (most likely in the "partial" TLS lifecycle state)
1. It does not have configured connections to other routers that are in the "deployed" state

Eligibility for bootstrap deployment is indicated by a deployment-state of "ready-bootstrap".

## The Boostrap Process

The bootstrap deployment process may begin for an eligible backbone router (designated by deployment-state "ready-bootstrap").

### Step 1 - Initial Deployment Yaml

The management-controller provides the initial deployment Yaml using the following API:

    GET https://<hostport>/api/v1alpha1/backbonesite/<site-id>/kube

The user must apply this Yaml on the new backbone site.

### Step 2 - Upload Site's Ingress Json

The user (via a to-be-determined process) obtains a small Json text from the site that describes the site's ingress for management access.  This text is provided to the management-controller by an text-edit widget in the console.  The text is posted using the following API:

    POST https://<hostport>/api/v1alpha1/backbonesite/<site-id>/ingress

Note that the POST must contain the following header:

    Content-Type: application/json

### Step 3 - Incoming Links Yaml

The final step is the generation of the final Yaml for site configuration.  Like, the initial deployment yaml, the management-controller generates Yaml text to be applied at the bootstrap site.  This is accessed using the following API:

    GET https://<hostport>/api/v1alpga1/backbonesite/<site-id>/links/incoming/kube

Once the user applies this Yaml text to the site, the bootstrap process is completed and the backbone site should transition to deployment-state "deployed".