"""Detecta escrituras (ORM y Core) y publica el nombre de las tablas tras el commit."""
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.realtime import hub

_CLAVE = "tablas_modificadas"


def _marcar(session: Session, tabla: str) -> None:
    session.info.setdefault(_CLAVE, set()).add(tabla)


@event.listens_for(Session, "do_orm_execute")
def _registrar_sentencia(orm_execute_state):
    if orm_execute_state.is_insert or orm_execute_state.is_update or orm_execute_state.is_delete:
        tabla = getattr(orm_execute_state.statement, "table", None)
        if tabla is not None:
            _marcar(orm_execute_state.session, tabla.name)


@event.listens_for(Session, "before_flush")
def _registrar_flush(session, flush_context, instances):
    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        tabla = getattr(obj, "__table__", None)
        if tabla is not None:
            _marcar(session, tabla.name)


@event.listens_for(Session, "after_commit")
def _publicar_commit(session):
    tablas = session.info.pop(_CLAVE, None)
    if tablas:
        hub.publicar({"tipo": "cambio", "tablas": sorted(tablas)})


@event.listens_for(Session, "after_rollback")
def _descartar_rollback(session):
    session.info.pop(_CLAVE, None)
