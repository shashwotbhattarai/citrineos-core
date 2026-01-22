# SPDX-FileCopyrightText: 2025 Yatri Motorcycles
#
# SPDX-License-Identifier: Apache-2.0
#
# Custom Hasura image with metadata baked in for CI/CD deployment
# This eliminates the need for volume mounts on EC2

FROM hasura/graphql-engine:v2.44.0.cli-migrations-v3

# Copy metadata into the image
COPY hasura-metadata /hasura-metadata

# The cli-migrations-v3 image will automatically apply metadata on startup
# from /hasura-metadata directory
