FROM wordpress:cli-php8.2

USER root

# Install AWS CLI via apk (no pip) to avoid PEP668 error
RUN apk add --no-cache aws-cli groff less \
  && aws --version

USER 33:33
