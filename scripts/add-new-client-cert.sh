#!/bin/bash

clientname=$1
easyrsapath=$2
targetdir=$3

cd ${easyrsapath}/easyrsa3

./easyrsa build-client-full client.${clientname}.tld nopass

cp pki/issued/client.${clientname}.tld.crt ${targetdir}
cp pki/private/client.${clientname}.tld.key ${targetdir}