#!/usr/bin/env bash

function create_secret {
    for i in {1000..2000};
    do
#         echo "admin-$i"
        kubectl create secret generic fake-user-$i --from-literal=username=admin-$i --from-literal=password='S!B\*d$zDsb='
    done

}

time create_secret

# finished in 52 ~ 60 seconds
