"""Captura métricas de armazenamento e grava no banco do projeto EcomCore.

A coleta de capacidade usa psutil. Métricas de desempenho são calculadas a partir
 dos contadores cumulativos de I/O do disco físico; latência é estimada pelo tempo
 médio por operação, e a utilização (%) usa contador de tempo ocupado quando o
 Windows fornece esse contador, caso contrário fica como estimativa baseada em IOPS.
"""
import os, time, subprocess, re
import psutil
import mysql.connector

METRICAS_DISCO = {
 "disco_percentual": ("Uso de disco (%)", 80, 90),
 "disco_usado_gb": ("Disco usado (GB)", 0, 0),
 "disco_livre_gb": ("Disco livre (GB)", 0, 0),
 "disco_total_gb": ("Disco total (GB)", 0, 0),
 "disco_io_utilizacao_percent": ("Utilização I/O (%)", 80, 90),
 "disco_iops": ("IOPS", 0, 0),
 "disco_latencia_leitura_ms": ("Latência leitura (ms)", 0, 0),
 "disco_latencia_escrita_ms": ("Latência escrita (ms)", 0, 0),
 "disco_leitura_mb_s": ("Leitura (MB/s)", 0, 0),
 "disco_escrita_mb_s": ("Escrita (MB/s)", 0, 0),
}
_ultima_captura = None
_ultimo_io = None

def _counter_busy_percent():
 """Tenta consultar % Disk Time via Windows Performance Counter (PowerShell)."""
 if os.name != 'nt': return None
 try:
  cmd=['powershell','-NoProfile','-Command',"(Get-Counter '\PhysicalDisk(_Total)\% Disk Time' -ErrorAction Stop).CounterSamples[0].CookedValue"]
  output=subprocess.check_output(cmd,stderr=subprocess.DEVNULL,timeout=3,text=True).strip()
  value=float(output.replace(',','.'))
  return max(0.0,min(100.0,value))
 except Exception:
  return None

def coletar_dados_disco(caminho=None):
 global _ultima_captura,_ultimo_io
 if caminho is None:
  caminho=os.environ.get('DISCO_MONITORADO') or (os.path.abspath(os.sep) if os.name!='nt' else os.environ.get('SystemDrive','C:')+'\\')
 uso=psutil.disk_usage(caminho)
 counters=psutil.disk_io_counters(perdisk=False)
 now=time.monotonic(); gb=1024**3; mb=1024**2
 read_mb_s=write_mb_s=iops=lat_read=lat_write=0.0
 if counters and _ultimo_io is not None and _ultima_captura is not None:
  dt=max(now-_ultima_captura,0.001)
  dr=max(counters.read_bytes-_ultimo_io.read_bytes,0); dw=max(counters.write_bytes-_ultimo_io.write_bytes,0)
  nr=max(counters.read_count-_ultimo_io.read_count,0); nw=max(counters.write_count-_ultimo_io.write_count,0)
  read_mb_s=dr/mb/dt; write_mb_s=dw/mb/dt; iops=(nr+nw)/dt
  lat_read=(counters.read_time-_ultimo_io.read_time)/max(nr,1) if nr else 0.0
  lat_write=(counters.write_time-_ultimo_io.write_time)/max(nw,1) if nw else 0.0
  lat_read=max(float(lat_read),0.0);lat_write=max(float(lat_write),0.0)
 _ultima_captura=now;_ultimo_io=counters
 busy=_counter_busy_percent()
 # fallback de indicador quando o contador nativo não estiver disponível: aproximação baseada em IOPS.
 io_percent=busy if busy is not None else min(iops,100.0)
 return {
  'disco_percentual':float(uso.percent),'disco_usado_gb':round(uso.used/gb,2),
  'disco_livre_gb':round(uso.free/gb,2),'disco_total_gb':round(uso.total/gb,2),
  'disco_io_utilizacao_percent':round(float(io_percent),2),'disco_iops':round(float(iops),2),
  'disco_latencia_leitura_ms':round(float(lat_read),3),'disco_latencia_escrita_ms':round(float(lat_write),3),
  'disco_leitura_mb_s':round(float(read_mb_s),3),'disco_escrita_mb_s':round(float(write_mb_s),3),
 }

def preparar_especificacoes_disco(config_banco,id_servidor):
 conexao=mysql.connector.connect(**config_banco);cursor=None
 try:
  cursor=conexao.cursor(dictionary=True)
  cursor.execute("SELECT id FROM tipo_componente WHERE nome=%s LIMIT 1",('Disco',))
  tipo=cursor.fetchone()
  if tipo is None: raise ValueError("Tipo de componente 'Disco' não cadastrado.")
  for descricao,attention,critical in METRICAS_DISCO.values():
   cursor.execute("SELECT id FROM componente WHERE fk_tipo_componente=%s AND descricao=%s LIMIT 1",(tipo['id'],descricao))
   comp=cursor.fetchone()
   if comp is None:
    cursor.execute("INSERT INTO componente (descricao,fk_tipo_componente) VALUES (%s,%s)",(descricao,tipo['id']));component_id=cursor.lastrowid
   else: component_id=comp['id']
   cursor.execute("SELECT id FROM especificacao_tecnica WHERE fk_servidor=%s AND fk_componente=%s AND ativo=1 LIMIT 1",(id_servidor,component_id))
   if cursor.fetchone(): continue
   cursor.execute("INSERT INTO metrica (limite_atencao,limite_critico) VALUES (%s,%s)",(attention,critical));metric_id=cursor.lastrowid
   cursor.execute("INSERT INTO especificacao_tecnica (fk_servidor,fk_componente,fk_metrica,ativo) VALUES (%s,%s,%s,1)",(id_servidor,component_id,metric_id))
  conexao.commit()
 except Exception:
  conexao.rollback();raise
 finally:
  if cursor:cursor.close()
  conexao.close()

def gravar_metricas_disco(config_banco,id_servidor):
 dados=coletar_dados_disco();descricoes=tuple(item[0] for item in METRICAS_DISCO.values())
 conexao=mysql.connector.connect(**config_banco);cursor=None
 try:
  cursor=conexao.cursor(dictionary=True);marks=', '.join(['%s']*len(descricoes))
  cursor.execute(f"SELECT et.id AS especificacao_id,c.descricao FROM especificacao_tecnica et JOIN componente c ON c.id=et.fk_componente WHERE et.fk_servidor=%s AND et.ativo=1 AND c.descricao IN ({marks})",(id_servidor,*descricoes))
  specs={r['descricao']:r['especificacao_id'] for r in cursor.fetchall()}
  for key,(desc,_,_) in METRICAS_DISCO.items():
   spec=specs.get(desc)
   if spec is not None: cursor.execute("INSERT INTO captura (valor,horario,fk_especificacao_tecnica) VALUES (%s,NOW(),%s)",(dados[key],spec))
  conexao.commit();return dados
 except Exception:
  conexao.rollback();raise
 finally:
  if cursor:cursor.close()
  conexao.close()

def buscar_metricas_disco(config_banco,id_servidor,limite=30):
 descricoes=tuple(item[0] for item in METRICAS_DISCO.values());conexao=mysql.connector.connect(**config_banco);cursor=None
 try:
  cursor=conexao.cursor(dictionary=True);marks=', '.join(['%s']*len(descricoes))
  cursor.execute(f"SELECT c.descricao,cap.valor,cap.horario FROM captura cap JOIN especificacao_tecnica et ON et.id=cap.fk_especificacao_tecnica JOIN componente c ON c.id=et.fk_componente WHERE et.fk_servidor=%s AND et.ativo=1 AND c.descricao IN ({marks}) ORDER BY cap.horario DESC,cap.id DESC LIMIT %s",(id_servidor,*descricoes,limite*len(descricoes)))
  grouped={}
  for row in reversed(cursor.fetchall()):
   timestamp=row['horario'].strftime('%Y-%m-%d %H:%M:%S');entry=grouped.setdefault(timestamp,{'horario':row['horario'].strftime('%H:%M:%S')})
   key=next((k for k,v in METRICAS_DISCO.items() if v[0]==row['descricao']),None)
   if key:entry[key]=float(row['valor'])
  return list(grouped.values())[-limite:]
 finally:
  if cursor:cursor.close()
  conexao.close()
