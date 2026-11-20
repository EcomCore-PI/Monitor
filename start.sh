#!/bin/bash
python -u servidor.py &
java -jar /app/captura.jar &

# se um dos dois cair, o container encerra e o restart o recria
wait -n
exit 1
